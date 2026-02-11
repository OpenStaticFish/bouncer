import { runApp } from './src/app'

const args = process.argv.slice(2)
const localMode = args.includes('-l') || args.includes('--local')

runApp(localMode).catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
