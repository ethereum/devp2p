const assert = require('assert')
const { convertTable, main } = require('./index')

it('Convert table', () => {
    const features = [
        {name: "Batman", features: ["rich", "fly"]},
        {name: "Superman", features: ["fly", "strong"]},
    ]
    const expected = [
        ["", "fly", "rich", "strong"],
        ["Batman", "yes", "yes", "no"],
        ["Superman", "yes", "no", "yes"],
    ]
    const got = convertTable(features, "yes", "no")
    assert.deepStrictEqual(got, expected)
})

it('Generate SVG', () => {
    main({featuresFile: 'test/clients.json', svgResultsFile: 'tmp.svg', stylesFile: 'test/style.css'})
})