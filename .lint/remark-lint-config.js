// Get list of plugins from package.json.
var fs = require('fs'), path = require('path');
var packageFile = path.resolve(__dirname, 'package.json');
var deps = Object.keys(JSON.parse(fs.readFileSync(packageFile)).dependencies);

var pluginOptions = {
    'remark-lint-code-block-style': 'indented',
    'remark-lint-emphasis-marker': '*',
    'remark-lint-strong-marker': '*',
    'remark-lint-heading-style': 'atx',
    'remark-lint-list-item-indent': 'space',
    'remark-lint-no-heading-punctuation': '.,;:!',
    'remark-lint-unordered-list-marker-style': '-',
    'remark-lint-no-dead-urls': { skipOffline: true },
    'remark-lint-no-missing-blank-lines': { exceptTightLists: true },
};

exports.plugins = [];
deps.forEach(function (d) {
    if (d.match(/^remark-(lint|validate)/)) {
        var option = pluginOptions[d];
        exports.plugins.push(option ? [d, option] : d);
    }
});
