/**
 * Recieves new Media.
 *
 * @author Jared Allard
 * @license MIT
 * @version 1
 */

const express = require('express')
const path = require('path')
const bp = require('body-parser')
const multer = require('multer')
const roman = require('roman-numerals')
const logger = require('pino')({
  name: path.basename(__filename)
})
const os = require('os')
const hfs = require('fs-extra')

const { opentracing, error } = require('triton-core/tracer')
const OpenTags = opentracing.Tags

// abstractions
const S3 = require('./backends/s3')

let app = express()

app.use(bp.json())

// Not sure if we want to persist ids since we're sorta a
// one shot service.
const mediaIds = {}

/**
 * Attempt to determine a name based on number.
 *
 * @param  {String} name         series name
 * @param  {String} originalName original file name
 * @param  {Number} season       season number
 * @return {String}              new file name
 */
const getName = (name, originalName, season = 1) => {
  const matches = /(\d+|i+)?(?: -)?(?:[e _x[]|^)(\d+)(?!x)/gi.exec(originalName)
  if (matches === null) {
    return null
  }

  if (matches[1]) {
    // try to parse a number
    const suspectedSeason = parseInt(matches[1], 10)
    if (isNaN(suspectedSeason)) {
      // try to parse a roman numeral
      try {
        season = roman.toArabic(matches[1])
      } catch (err) {
        logger.error('failed to parse season string, defaulting to ', season)
      }
    } else {
      season = suspectedSeason
    }
  } else {
    logger.info('getName', 'failed to determine season number, defaulting to', season)
  }

  const num = parseInt(matches[2], 0)

  if (originalName.indexOf('NCED') !== -1 || originalName.indexOf('NCOP') !== -1 || originalName.indexOf('Commic') !== -1 || originalName.indexOf('OVA') !== -1) {
    logger.info('getName', 'skipping NCED/OP/OVA', originalName)
    return null
  }

  logger.debug('getName', matches, num)
  if (!num) {
    logger.error('Unable to determine series number.')
    return null
  }

  let seasonEntry = `S${season}E`

  return {
    filename: `${name} - ${seasonEntry}${num}.mkv`,
    season,
    episode: num
  }
}

/**
 * Process a card name and strip unneeded information.
 *
 * @param {String} name - card name
 */
const getSeriesName = name => {
  const processor = /(.+) Season/gi.exec(name)
  let realName
  if (processor === null) {
    logger.warn('Failed to process name, defaulting to original name (expected with non season cards)')
    realName = name
  } else {
    realName = processor[1]
  }

  return realName
}

module.exports = async (config, tracer) => {
  let basePath = config.instance.location
  if (!path.isAbsolute(basePath)) {
    logger.debug('path:is-absolute', false)
    basePath = path.join(__dirname, '../', basePath)
  }
  logger.info('storage', basePath)

  const staging = multer({
    dest: os.tmpdir()
  })

  /**
   * GetPath returns the path to store media at
   * @param {String} name name of the series
   * @param {String} type type of the media
   */
  const getPath = async (name, type) => {
    let typePath = type
    const configTypePath = config.instance.types[type]
    if (configTypePath) {
      typePath = configTypePath
      logger.info('config:type:path', type, '->', typePath)
    }

    return path.join(typePath, name)
  }

  app.use((req, res, next) => {
    logger.info('generating span')
    const parentSpanContext = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers)
    const span = tracer.startSpan('http_request', {
      childOf: parentSpanContext
    })
    span.setTag(OpenTags.HTTP_URL, req.url)
    span.setTag(OpenTags.HTTP_METHOD, req.method)
    req.span = span
    return next()
  })

  /**
   * Health Check
   */
  app.get('/health', (req, res) => {
    return res.send({
      message: 'Something tells me everything is not going to be fine.'
    })
  })

  /**
   * Create a new media entry.
   */
  app.post('/v1/media', async (req, res) => {
    const { type, name, id } = req.body

    if (!type || !name || !id) {
      const err = new Error('Missing type, name, or id')
      error(req.span, err)
      return res.status(400).send({
        success: false,
        message: err.message
      })
    }

    const realName = getSeriesName(name)

    logger.info('new', type, realName, id)

    mediaIds[id] = {
      name: realName,
      type: type,
      season: 1
    }

    req.span.finish()
    return res.send({
      success: true,
      id
    })
  })

  /**
   * Add a file to the media folder.
   */
  app.put('/v1/media/:id', staging.any(), async (req, res) => {
    const id = req.body.id || req.params.id
    const pointer = mediaIds[id]

    /**
     * errorHandler is a generic handler for errors to handle span finishing
     * as well as error propegation
     * @param {Error} err - error to send
     * @param {Number} statusCode - status code num
     * @param {Boolean} retryable - should retry or not
     */
    const errorHandler = (err, statusCode = 500, retryable = false) => {
      if (!err) {
        return req.span.finish()
      }

      res.status(statusCode).send({
        success: false,
        retryable,
        message: err.message
      })
      error(req.span, err)
    }

    if (!pointer) {
      return errorHandler(new Error('Media ID not found'), 400)
    }

    logger.info('media:add', id, pointer.name)
    logger.debug('media:files', req.files)
    if (!req.files) {
      return errorHandler(new Error('No file ID provided'), 400)
    }

    const file = req.files[0]
    if (!file) {
      return errorHandler(new Error('Missing file'), 400)
    }

    if (!file.path) {
      logger.info(file)
      return errorHandler(new Error('Invalid formdata (!.path)'))
    }

    if (!await hfs.pathExists(file.path)) {
      logger.error('file doesnt exist')
      return errorHandler(new Error('Internal Server Error'), 500, true)
    }

    if (req.files.length !== 1) {
      await hfs.remove(file.path)
      return errorHandler(new Error('Multiple files is currently unsupported', 400))
    }

    let name
    try {
      if (pointer.type === 'movie') name = `${pointer.name}.mkv`
      if (pointer.type === 'tv') {
        const info = getName(pointer.name, file.originalname, pointer.season)

        if (!info) {
          logger.warn(`skipped '${file.originalname}', unable to determine information from name`)
          errorHandler()
          return res.send({
            success: true,
            message: 'Media was skipped.'
          })
        }

        name = info.filename
      }

      logger.info(file.originalname, '->', name)
    } catch (e) {
      logger.error('err', e.message)
      console.log(e)

      await hfs.unlink(file.path)
      return errorHandler(new Error('Failed to determine name of media'))
    }

    // basePath is the base path to pass to the fs abstraction
    const basePath = await getPath(pointer.name, pointer.type)
    let output = path.join(basePath, name).replace(/^\//, '')

    logger.info('media:move', file.filename, '->', output)

    // TODO: make configurable
    const s3 = new S3('triton-media', config)

    const methods = {
      s3: s3
    }

    for (let methodName of Object.keys(methods)) {
      /**
       * While this isn't a S3 client, maybe, they all use that format
       * @type {S3}
       */
      const method = methods[methodName]
      logger.info(`Uploading media file '${path.basename(file.path)}' to ${methodName}`)

      try {
        if (await method.pathExists(output)) {
          if (pointer.type === 'tv') {
            logger.warn('file exists, assuming new season')
            mediaIds[id].season++

            const info = getName(pointer.name, file.originalname, mediaIds[id].season)
            if (info.season !== mediaIds[id].season) {
              logger.warn('we suspected the season was', mediaIds[id].season, 'but got', info.season, 'during parsing. Using that.')
              mediaIds[id].season = info.season
            }

            name = info.filename
            output = path.join(pointer.path, name)

            logger.info('new path', output)
          } else {
            logger.warn(`removed existing ${output}`)
            await method.unlink(output)
          }
        }

        await method.create(file.path, output)
      } catch (e) {
        if (await method.pathExists(output)) {
          logger.error('cleaning up stale link')
          await hfs.remove(file.path)
        }

        // cleanup the remote file (safe retry)
        try {
          await method.unlink(output)
        } catch (e) {
          logger.warn('cleanup:file', `Failed to cleanup file '${output}': ${e.error}`)
        }

        logger.error('create', `Failed to create file '${output}': ${e.message}`)
        return errorHandler(new Error('Failed to link media'), 500, true)
      }
    }

    errorHandler()
    return res.send({
      success: true
    })
  })

  app.listen(8001, () => {
    logger.info('listening on *:8001')
  })
}

// for tests
module.exports.getName = getName
module.exports.getSeriesName = getSeriesName
