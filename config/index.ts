type WebpackChain = {
  resolve: {
    modules: {
      prepend(path: string): void
    }
  }
}

const dependencyModules = process.env.TARO_DEPENDENCY_NODE_MODULES

const config = async () => ({
  projectName: 'mahjong-score-taro',
  date: '2026-07-31',
  designWidth: 750,
  deviceRatio: { 375: 2, 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: true },
  alias: {
    '@': require('path').resolve(__dirname, '..', 'src'),
    '@shared': require('path').resolve(__dirname, '..', 'src', 'shared'),
  },
  mini: dependencyModules ? {
    webpackChain(chain: WebpackChain) {
      chain.resolve.modules.prepend(dependencyModules)
    },
  } : {},
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    devServer: {
      proxy: {
        '/api': {
          target: process.env.TARO_APP_API_BASE || 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
  },
})

export default config
