/**
 * Recieves new Media.
 *
 * @author Jared Allard
 * @license MIT
 * @version 1
 */

const express = require('express')
const path = require('path')
const fs = require('fs-extra')
const bp = require('body-parser')
const multer = require('multer')
const logger = require('pino')({
  name: path.basename(__filename)
})

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
  const matches = /[e _x](\d+)(?!x)/gi.exec(originalName)
  if (matches === null) {
    return null
  }

  const num = parseInt(matches[1], 0)

  if (originalName.indexOf('NCED') !== -1 || originalName.indexOf('NCOP') !== -1 || originalName.indexOf('Commic') !== -1) {
    logger.info('getName', 'skipping NCED/OP', originalName)
    return null
  }

  logger.debug('getName', matches, num)
  if (!num) throw new Error('Unable to determine series number.')

  let seasonEntry = ''
  if (season !== 1) {
    seasonEntry = `S${season}E`
  }

  return `${name} - ${seasonEntry}${num}.mkv`
}

module.exports = async config => {
  let basePath = config.instance.location
  if (!path.isAbsolute(basePath)) {
    logger.debug('path:is-absolute', false)
    basePath = path.join(__dirname, '../', basePath)
  }
  logger.info('storage', basePath)

  const STAGING = path.join(basePath, 'staging')
  await fs.ensureDir(STAGING)

  const staging = multer({
    dest: STAGING
  })

  const getPath = async (name, type) => {
    // HACK
    if (type.indexOf('..') !== -1) throw new Error('Directory traversel attempt.')
    if (name.indexOf('..') !== -1) throw new Error('Directory traversel attempt.')

    let typePath = type
    const configTypePath = config.instance.types[type]
    if (configTypePath) {
      typePath = configTypePath
      logger.info('config:type:path', type, '->', typePath)
    }

    return path.join(basePath, typePath, name)
  }

  /**
   * Check if media already exists or not.
   *
   * @param {String} name name of media
   * @param {String} type type of media (movie/tv)
   */
  const exists = async (name, type) => {
    const loc = await getPath(name, type)
    return fs.pathExists(loc)
  }

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
      return res.status(400).send({
        success: false,
        message: 'Missing type, name, or id.'
      })
    }

    const storeAt = await getPath(name, type)
    await fs.ensureDir(storeAt)

    logger.info('new', type, name, id)

    logger.info('new:store', storeAt)

    mediaIds[id] = {
      name: name,
      type: type,
      path: storeAt,
      season: 1
    }

    return res.send({
      data: {
        path: storeAt,
        existed: await exists(name, type)
      },
      success: true
    })
  })

  /**
   * Add a file to the media folder.
   */
  app.put('/v1/media/:id', staging.any(), async (req, res) => {
    const id = req.body.id || req.params.id
    const pointer = mediaIds[id]

    if (!pointer) {
      return res.status(400).send({
        success: false,
        message: 'Media id not found.'
      })
    }

    logger.info('media:add', id, pointer.name)
    logger.debug('media:files', req.files)
    if (!req.files) {
      return res.status(400).send({
        success: false,
        message: 'No file provided.'
      })
    }

    const file = req.files[0]
    if (!file) {
      return res.status(400).send({
        success: false,
        message: 'Missing file.'
      })
    }

    if (req.files.length !== 1) {
      await fs.unlink(file.path)
      return res.status(400).send({
        success: false,
        message: 'Multiple files is not supported yet.'
      })
    }

    let name
    try {
      if (pointer.type === 'movie') name = `${pointer.name}.mkv`
      if (pointer.type === 'tv') name = getName(pointer.name, file.originalname, pointer.season)

      logger.info(file.originalname, '->', name)

      // getName told us to skip this
      if (name === null) {
        return res.status(200).send({
          success: true,
          message: 'Media was skipped.'
        })
      }
    } catch (e) {
      logger.error('err', e.message)
      console.log(e)

      await fs.unlink(file.path)
      return res.status(400).send({
        success: false,
        message: 'Failed to determine name of media.'
      })
    }

    let output = path.join(pointer.path, name)
    logger.info('media:move', file.filename, '->', output)

    try {
      if (await fs.pathExists(output)) {
        if (pointer.type === 'tv') {
          logger.warn('file exists, assuming new season')
          mediaIds[id].season++

          name = getName(pointer.name, file.originalname, mediaIds[id].season)
          output = path.join(pointer.path, name)

          logger.info('new path', output)
        } else {
          logger.warn(`removed existing ${output}`)
          await fs.unlink(output)
        }
      }

      await fs.move(file.path, output)
    } catch (e) {
      if (await fs.pathExists(output)) {
        logger.error('cleaning up stale link')
        await fs.unlink(file.path)
      }

      logger.error('link', e.message)
      return res.status(500).send({
        success: false,
        message: 'Failed to link media.'
      })
    }

    return res.send({
      success: true
    })
  })

  app.listen(8001, () => {
    logger.info('listening on *:8001')
  })
}
