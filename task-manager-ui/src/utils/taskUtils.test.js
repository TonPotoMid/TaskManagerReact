import { describe, expect, it } from 'vitest'
import { createTaskDataset, filterTasks, paginateTasks } from './taskUtils'

describe('taskUtils - dataset 1000 tâches', () => {
  it('génère exactement 1000 tâches valides', () => {
    const tasks = createTaskDataset(1000)

    expect(tasks).toHaveLength(1000)
    expect(tasks[0].id).toBe(1)
    expect(tasks[999].id).toBe(1000)
    expect(new Set(tasks.map((task) => task.id)).size).toBe(1000)
  })

  it('filtre correctement sur un mot-clé accentué ou non accentué', () => {
    const tasks = createTaskDataset(1000)

    const withAccent = filterTasks(tasks, 'tâche spéciale accentuée')
    const withoutAccent = filterTasks(tasks, 'tache speciale accentuee')

    expect(withAccent.length).toBeGreaterThan(0)
    expect(withoutAccent.length).toBe(withAccent.length)
  })

  it('retourne la bonne pagination pour la page 1 (taille 25)', () => {
    const tasks = createTaskDataset(1000)
    const filtered = filterTasks(tasks, '')

    const result = paginateTasks(filtered, 1, 25)

    expect(result.totalPages).toBe(40)
    expect(result.items).toHaveLength(25)
    expect(result.items[0].id).toBe(1)
    expect(result.items[24].id).toBe(25)
    expect(result.firstVisibleItem).toBe(1)
    expect(result.lastVisibleItem).toBe(25)
  })

  it('retourne la bonne pagination pour une page intermédiaire', () => {
    const tasks = createTaskDataset(1000)
    const filtered = filterTasks(tasks, '')

    const result = paginateTasks(filtered, 10, 25)

    expect(result.items).toHaveLength(25)
    expect(result.items[0].id).toBe(226)
    expect(result.items[24].id).toBe(250)
    expect(result.firstVisibleItem).toBe(226)
    expect(result.lastVisibleItem).toBe(250)
  })

  it('retourne la bonne pagination pour la dernière page', () => {
    const tasks = createTaskDataset(1000)
    const filtered = filterTasks(tasks, '')

    const result = paginateTasks(filtered, 40, 25)

    expect(result.items).toHaveLength(25)
    expect(result.items[0].id).toBe(976)
    expect(result.items[24].id).toBe(1000)
    expect(result.firstVisibleItem).toBe(976)
    expect(result.lastVisibleItem).toBe(1000)
  })

  it('recale automatiquement la page hors borne', () => {
    const tasks = createTaskDataset(1000)

    const result = paginateTasks(tasks, 999, 100)

    expect(result.totalPages).toBe(10)
    expect(result.currentPage).toBe(10)
    expect(result.items[0].id).toBe(901)
    expect(result.items[result.items.length - 1].id).toBe(1000)
  })

  it('garde la cohérence après suppression simulée', () => {
    const tasks = createTaskDataset(1000)
    const afterDelete = tasks.filter((task) => task.id !== 250)

    const result = paginateTasks(afterDelete, 10, 25)

    expect(afterDelete).toHaveLength(999)
    expect(result.items).toHaveLength(25)
    expect(result.items.some((task) => task.id === 250)).toBe(false)
  })
})
