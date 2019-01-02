/**
 * Stashes new Media and organizes it.
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const path = require('path')
const logger = require('pino')({
  name: path.basename(__filename)
})
const Config = require('triton-core/config')
const Tracer = require('triton-core/tracer').initTracer

const tracer = Tracer('twilight', logger)

logger.info('init', Date.now())

const init = async () => {
  const config = await Config('media')

  await require('./lib/reciever')(config, tracer)
}

init()
