const fs = require('fs');
const svgTable = require('pure-svg-table');

function convertTable(clientFeatures, has, hasNot) {
    let capSet = new Set()
    clientFeatures.forEach(c => {
        c.features.forEach(f => {
            capSet.add(f)
        })
    })
    let sortedCapList = Array.from(capSet).sort()
    const header = [""].concat(sortedCapList)
    let table = [header]
    clientFeatures.forEach(c => {
        let row = [c.name]
        sortedCapList.forEach(f => {
            let cell
            if (c.features.indexOf(f) == -1) {
                cell = hasNot
            }
            else {
                cell = has
            }
            row.push(cell)
        })
        table.push(row)
    })
    return table
}

function main(newOpts) {
    let opts = {
        featuresFile: '../caps/clients.json',
        has: "✔️",
        hasNot: "❌",
        svgResultsFile: '../caps/generated-features.svg',
        stylesFile: 'styles.css',
    }
    Object.assign(opts, newOpts)
    const clientFeatures = JSON.parse(fs.readFileSync(opts.featuresFile).toString())
    let style
    if (opts.stylesFile !== undefined) {
        style = fs.readFileSync(opts.stylesFile).toString()
    }
    const rawTable = convertTable(clientFeatures, opts.has, opts.hasNot)
    const svg = svgTable.generateTable(rawTable, style)
    fs.writeFileSync(opts.svgResultsFile, svg)
}

module.exports = {
    convertTable: convertTable,
    main: main,
}

if (require.main === module) {
    main()
}
