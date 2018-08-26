const fs = require('fs-extra')
const yaml = require('js-yaml')
const path = require('path')
const { expect } = require('chai')

describe('getName()', () => {

  const movieData = yaml.safeLoadAll(fs.readFileSync(path.join(__dirname, './testdata/movies.yaml')))
  const { getName } = require('../lib/reciever')

  const movies = movieData[0].movies.valid

  movies.forEach(movie => {    
    it(`should properly parse: '${movie.name}'`, () => {
      const data = getName('test', movie.name, 1)

      expect(data).to.be.a.instanceof(Object)
      expect(data.season).to.equal(movie.data.season, 'Failed to determine correct season')
      expect(data.episode).to.equal(movie.data.episode, 'Failed to determine correct episode')
    })
  })
})

describe('getSeriesName()', () => {
  const cardData = yaml.safeLoadAll(fs.readFileSync(path.join(__dirname, './testdata/cards.yaml')))
  const { getSeriesName } = require('../lib/reciever')

  const cards = cardData[0].cards.valid

  cards.forEach(card => {    
    it(`should properly parse: '${card.name}'`, () => {
      const name = getSeriesName(card.name)

      expect(name).to.equal(card.expected.name, 'Failed to determine correct series name')
    })
  })
})