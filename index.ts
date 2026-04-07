import cors from 'cors'
import express from 'express'

export interface Item {
	id: string
	selected: boolean
	order: number
}

type ItemUpdates = Partial<Omit<Item, 'id'>>

class MemoryStore {
	private items: Map<Item['id'], Item> = new Map()
	private nextOrder: number = 1
	private addBuffer: Set<Item['id']> = new Set()
	private updateBuffer: Map<Item['id'], ItemUpdates> = new Map()

	constructor() {
		for (let i = 1; i <= 100; i++) {
			const id = i.toString()
			this.setItem(id, this.defaultItem(id))
		}
	}

	defaultItem(id: Item['id']) {
		return { id, selected: false, order: 0 }
	}

	getItem(id: Item['id']) {
		return this.items.get(id)
	}

	private setItem(id: Item['id'], item: Item) {
		this.items.set(id, item)
	}

	private addItem(id: Item['id']): { success: boolean; error?: string } {
		if (this.items.has(id)) {
			return { success: false, error: `Item with id ${id} already exists` }
		}
		this.setItem(id, this.defaultItem(id))
		return { success: true }
	}

	getAllItems() {
		return Array.from(this.items.values())
	}

	getFilterSelectedItems(items: Item[]) {
		return items.filter(item => item.selected)
	}

	getSortOrderedItems(items: Item[]) {
		return items.sort((a, b) => a.order - b.order)
	}

	private getCursoredItems(
		filter: string,
		cursor: number,
		limit: number,
		selected: boolean,
	) {
		let slicedItems = this.getAllItems().slice(cursor)
		if (selected) slicedItems = this.getSortOrderedItems(slicedItems)

		const items = []

		for (const item of slicedItems) {
			cursor++
			if (item.selected === selected && item.id.includes(filter)) {
				items.push(item)
				limit--
				if (limit === 0) return { items, cursor }
			}
		}

		return { items }
	}

	getSelected(filter: string, cursor: number, limit: number) {
		return this.getCursoredItems(filter, cursor, limit, true)
	}

	getNonSelected(filter: string, cursor: number, limit: number) {
		return this.getCursoredItems(filter, cursor, limit, false)
	}

	flushAdditions() {
		if (this.addBuffer.size === 0) return

		this.addBuffer.forEach(id => this.addItem(id))
		this.addBuffer.clear()
	}

	flushUpdates() {
		if (this.updateBuffer.size === 0) return

		this.updateBuffer.forEach((itemUpdates, id) => {
			const item = this.getItem(id)
			if (item) this.setItem(id, { ...item, ...itemUpdates })
		})
		this.updateBuffer.clear()
		this.enqueueUpdateSelectedOrder()
	}

	enqueueAddition(id: Item['id']) {
		this.addBuffer.add(id)
		return this.defaultItem(id)
	}

	enqueueUpdate(id: Item['id'], item: ItemUpdates) {
		this.updateBuffer.set(id, item)
		return { id, ...this.getItem(id), ...item }
	}

	enqueueUpdateSelectedOrder() {
		const items = this.getSortOrderedItems(
			this.getFilterSelectedItems(this.getAllItems()),
		)

		const { length } = items
		for (let order = 0; order < length; order++) {
			const item = items[order]
			this.enqueueUpdate(item.id, { order })
		}

		this.nextOrder = length + 1
	}

	enqueueSetSelected(id: Item['id'], selected: boolean): Item | undefined {
		const item = this.getItem(id)
		if (!item) return

		let updatedItem
		if (selected && !item.selected) {
			updatedItem = this.enqueueUpdate(id, { selected: true, order: this.nextOrder++ })
		} else if (!selected && item.selected) {
			updatedItem = this.enqueueUpdate(id, { selected: false, order: 0 })
		}

		return updatedItem as Item
	}

	enqueueSetOrder(id: Item['id'], order: number): Item | undefined {
		if (!this.getItem(id)) return

		return this.enqueueUpdate(id, { order }) as Item
	}
}

export const store = new MemoryStore()

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
