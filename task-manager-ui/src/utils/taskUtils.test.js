import { describe, expect, it } from 'vitest'
import { createTaskDataset, filterTasks, paginateTasks } from './taskUtils'

const DATASET_SIZE = 100000

describe('taskUtils - dataset 100000 tâches', () => {
  it('génère exactement 100000 tâches valides', () => {
    const tasks = createTaskDataset(DATASET_SIZE)

    expect(tasks).toHaveLength(DATASET_SIZE)
    expect(tasks[0].id).toBe(1)
    expect(tasks[99999].id).toBe(DATASET_SIZE)
    expect(new Set(tasks.map((task) => task.id)).size).toBe(DATASET_SIZE)
  })

  it('filtre correctement sur un mot-clé accentué ou non accentué', () => {
    const tasks = createTaskDataset(DATASET_SIZE)

    const withAccent = filterTasks(tasks, 'tâche spéciale accentuée')
    const withoutAccent = filterTasks(tasks, 'tache speciale accentuee')

    expect(withAccent.length).toBeGreaterThan(0)
    expect(withoutAccent.length).toBe(withAccent.length)
  })

  it('retourne la bonne pagination pour la page 1 (taille 25)', () => {
    const tasks = createTaskDataset(DATASET_SIZE)
    const filtered = filterTasks(tasks, '')

    const result = paginateTasks(filtered, 1, 25)

    expect(result.totalPages).toBe(4000)
    expect(result.items).toHaveLength(25)
    expect(result.items[0].id).toBe(1)
    expect(result.items[24].id).toBe(25)
    expect(result.firstVisibleItem).toBe(1)
    expect(result.lastVisibleItem).toBe(25)
  })

  it('retourne la bonne pagination pour une page intermédiaire', () => {
    const tasks = createTaskDataset(DATASET_SIZE)
    const filtered = filterTasks(tasks, '')

    const result = paginateTasks(filtered, 10, 25)

    expect(result.items).toHaveLength(25)
    expect(result.items[0].id).toBe(226)
    expect(result.items[24].id).toBe(250)
    expect(result.firstVisibleItem).toBe(226)
    expect(result.lastVisibleItem).toBe(250)
  })

  it('retourne la bonne pagination pour la dernière page', () => {
    const tasks = createTaskDataset(DATASET_SIZE)
    const filtered = filterTasks(tasks, '')

    const result = paginateTasks(filtered, 4000, 25)

    expect(result.items).toHaveLength(25)
    expect(result.items[0].id).toBe(99976)
    expect(result.items[24].id).toBe(DATASET_SIZE)
    expect(result.firstVisibleItem).toBe(99976)
    expect(result.lastVisibleItem).toBe(DATASET_SIZE)
  })

  it('recale automatiquement la page hors borne', () => {
    const tasks = createTaskDataset(DATASET_SIZE)

    const result = paginateTasks(tasks, 9999, 100)

    expect(result.totalPages).toBe(1000)
    expect(result.currentPage).toBe(1000)
    expect(result.items[0].id).toBe(99901)
    expect(result.items[result.items.length - 1].id).toBe(DATASET_SIZE)
  })

  it('garde la cohérence après suppression simulée', () => {
    const tasks = createTaskDataset(DATASET_SIZE)
    const afterDelete = tasks.filter((task) => task.id !== 250)

    const result = paginateTasks(afterDelete, 10, 25)

    expect(afterDelete).toHaveLength(DATASET_SIZE - 1)
    expect(result.items).toHaveLength(25)
    expect(result.items.some((task) => task.id === 250)).toBe(false)
  })
})
