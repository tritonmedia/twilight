/**
 * Stashes new Media and organizes it.
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const debug = require('debug')('media:converter')
const Config = require('triton-core/config')

debug('init', Date.now())

const init = async () => {
  const config = await Config('media')

  await require('./lib/reciever')(config)
}

init()
