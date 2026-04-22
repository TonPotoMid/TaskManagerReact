export const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export const filterTasks = (tasks, searchTerm) => {
  const needle = normalizeText(searchTerm?.trim() ?? '')
  if (needle === '') {
    return tasks
  }

  return tasks.filter((task) => {
    const haystack = [
      String(task.id ?? ''),
      task.title ?? '',
      task.description ?? '',
      task.subjectName ?? '',
      task.priority ?? '',
      task.category ?? '',
      task.type ?? '',
      task.completed ? 'terminee terminée' : 'en cours',
      task.deadline ?? '',
    ].join(' ')

    return normalizeText(haystack).includes(needle)
  })
}

export const paginateTasks = (tasks, currentPage, pageSize) => {
  const safePageSize = Math.max(1, Number(pageSize) || 1)
  const totalPages = Math.max(1, Math.ceil(tasks.length / safePageSize))
  const safePage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages)

  const startIndex = (safePage - 1) * safePageSize
  const endIndex = startIndex + safePageSize
  const items = tasks.slice(startIndex, endIndex)

  const firstVisibleItem = tasks.length === 0 ? 0 : startIndex + 1
  const lastVisibleItem = tasks.length === 0 ? 0 : Math.min(endIndex, tasks.length)

  return {
    items,
    totalPages,
    currentPage: safePage,
    firstVisibleItem,
    lastVisibleItem,
  }
}

export const createTaskDataset = (count = 1000) => {
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const subjects = ['Mathématiques', 'Physique', 'Informatique', 'Anglais']

  return Array.from({ length: count }, (_, index) => {
    const id = index + 1
    const hasDeadline = id % 2 === 0

    return {
      id,
      title: `Task-${String(id).padStart(4, '0')}`,
      description: id % 10 === 0 ? `Tâche spéciale accentuée ${id}` : `Description de la tâche ${id}`,
      priority: priorities[index % priorities.length],
      subjectName: subjects[index % subjects.length],
      category: hasDeadline ? 'WITH_DEADLINE' : 'WITHOUT_DEADLINE',
      type: hasDeadline ? 'WITH_DEADLINE' : 'WITHOUT_DEADLINE',
      completed: id % 3 === 0,
      deadline: hasDeadline ? `2026-12-${String((id % 28) + 1).padStart(2, '0')}` : null,
    }
  })
}
