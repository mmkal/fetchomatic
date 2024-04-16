const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const wrap = async () => {
  const distFiles = childProcess
    .execSync('find dist/cjs -type f')
    .toString()
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(f => f.endsWith('.js'))
  distFiles.forEach(f => {
    const content = fs.readFileSync(f).toString()
    fs.writeFileSync(f, content.replaceAll(/\.js('|")/g, '.cjs$1'))
    fs.renameSync(f, f.replace(/\.js$/, '.cjs'))
  })
  const mod = require('../dist/cjs/index.cjs')
  fs.writeFileSync(
    path.join(__dirname, '../dist/esm-wrapper.mjs'),
    [
      `import Pkg from './cjs/index.cjs'`,
      '',
      ...Object.keys(mod)
        .filter(k => !k.startsWith('_') && k !== 'default')
        .map(k => `export const ${k} = Pkg.${k}`),
    ].join('\n'),
  )
}

wrap()
