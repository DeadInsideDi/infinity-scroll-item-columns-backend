import cors from 'cors'
import express from 'express'
import { store } from './store'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

const validateLimit = (limit: unknown) => {
	// make limit must be between 1 and 20
	return Math.max(Math.min(parseInt(limit as string) || 20, 20), 1)
}

app.get('/api/items/selected', (req, res) => {
	const filter = String(req.query.filter) || ''
	const limit = validateLimit(req.query.limit)
	const cursor = parseInt(req.query.cursor as string) || 0
	const result = store.getSelected(filter, cursor, limit)
	res.json(result)
})

app.get('/api/items/non-selected', (req, res) => {
	const filter = String(req.query.filter) || ''
	const limit = parseInt(req.query.limit as string) || 20
	const cursor = parseInt(req.query.cursor as string) || 0
	const result = store.getNonSelected(filter, cursor, limit)
	res.json(result)
})

app.post('/api/items', (req, res) => {
	const { id } = req.body
	if (typeof id !== 'string')
		return res.status(400).json({ error: 'id must be a string' })

	const item = store.enqueueAddition(id)
	res.json({ item })
})

app.post('/api/items/update-selected', (req, res) => {
	const { id, selected } = req.body

	if (typeof id !== 'string')
		return res.status(400).json({ error: 'id must be a string' })

	if (typeof selected !== 'boolean')
		return res.status(400).json({ error: 'selected must be a boolean' })

	const item = store.enqueueSetSelected(id, selected)
	res.json({ item })
})

app.put('/api/items/update-order', (req, res) => {
	const { id, order } = req.body

	if (typeof id !== 'string')
		return res.status(400).json({ error: 'id must be a string' })

	if (typeof order !== 'number')
		return res.status(400).json({ error: 'order must be a number' })

	const item = store.enqueueSetOrder(id, order)
	res.json({ item })
})

app.get('/', (req, res) => {
	res.send('Hello World!')
})

const updateInterval = setInterval(() => store.flushUpdates(), 1000)
const addInterval = setInterval(() => store.flushAdditions(), 10000)

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
})

const shutdown = () => {
	clearInterval(updateInterval)
	clearInterval(addInterval)
	store.flushUpdates()
	store.flushAdditions()
	setTimeout(() => process.exit(0), 5000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default app
