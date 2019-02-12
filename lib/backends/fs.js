/**
 * fs backend for twilight
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const fs = require('fs-extra')
const path = require('path')

/* eslint space-before-function-paren: [0] */

class FS {
  /**
   * constructs a FS class
   * @param {String} basePath base path to store everything at
   */
  constructor(basePath) {
    this._basePath = basePath
  }

  /**
   * _constructPath constructs a path to be safe within the "container"
   * @param {String} strPath path to transform
   */
  _constructPath(strPath) {
    return path.join(this._basePath, strPath)
  }

  /**
   * pathExists checks if a path exists
   * @param {String} path file path to check
   * @returns {Boolean} if it exists
   */
  async pathExists(path) {
    return fs.pathExists(this._constructPath(path))
  }

  /**
   * unlink removes a file path
   * @param {String} path file path to unlink
   */
  async unlink(path) {
    const exists = await this.pathExists(path)
    if (!exists) {
      throw new Error(`Failed to find file '${path}'`)
    }

    const safePath = this._constructPath(path)
    try {
      await fs.unlink(safePath)
    } catch (err) {
      throw new Error(`Failed to remove path '${path}': ${err.message}`)
    }
  }

  /**
   * create creates a new file from an existing file
   * @param {String} src file path
   * @param {String} dest file path to put at
   */
  async create(src, dest) {
    const exists = await this.pathExists(dest)
    if (exists) {
      throw new Error(`Object already exists '${dest}'`)
    }

    const safeDest = await this._constructPath(dest)
    return fs.move(src, safeDest)
  }
}

module.exports = FS
