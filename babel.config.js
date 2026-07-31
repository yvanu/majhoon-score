const path = require('path')

const dependencyModules = process.env.TARO_DEPENDENCY_NODE_MODULES
const taroPreset = dependencyModules
  ? path.join(dependencyModules, 'babel-preset-taro')
  : 'taro'

module.exports = {
  presets: [[taroPreset, { framework: 'react', ts: true }]],
}
