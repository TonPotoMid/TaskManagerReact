import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/

const toDisplayName = (value) => {
  const raw = String(value ?? '').trim()
  if (raw === '') {
    return 'Utilisateur'
  }

  const local = EMAIL_REGEX.test(raw) ? raw.split('@')[0] : raw
  const tokens = local
    .split(/[._\-\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return 'Utilisateur'
  }

  const [first, second] = tokens
  const capitalize = (token) => token.slice(0, 1).toUpperCase() + token.slice(1).toLowerCase()
  if (second) {
    return `${capitalize(first)} ${capitalize(second)}`
  }

  return capitalize(first)
}

const parseRouteFromHash = () => {
  const hash = (window.location.hash || '').replace(/^#/, '')
  const clean = hash.startsWith('/') ? hash : `/${hash}`

  if (clean === '/profile') {
    return { page: 'profile', taskId: null }
  }

  if (clean === '/dashboard') {
    return { page: 'dashboard', taskId: null }
  }

  if (clean === '/admin') {
    return { page: 'admin', taskId: null }
  }

  if (clean === '/tasks/new') {
    return { page: 'create', taskId: null }
  }

  const editMatch = clean.match(/^\/tasks\/(\d+)\/edit$/)
  if (editMatch) {
    return { page: 'edit', taskId: Number(editMatch[1]) }
  }

  const historyMatch = clean.match(/^\/tasks\/(\d+)\/history$/)
  if (historyMatch) {
    return { page: 'history', taskId: Number(historyMatch[1]) }
  }

  return { page: 'home', taskId: null }
}

const buildHash = (page, taskId = null) => {
  if (page === 'dashboard') {
    return '#/dashboard'
  }
  if (page === 'profile') {
    return '#/profile'
  }
  if (page === 'admin') {
    return '#/admin'
  }
  if (page === 'create') {
    return '#/tasks/new'
  }
  if (page === 'edit' && Number.isInteger(taskId)) {
    return `#/tasks/${taskId}/edit`
  }
  if (page === 'history' && Number.isInteger(taskId)) {
    return `#/tasks/${taskId}/history`
  }
  return '#/'
}

const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const Icon = ({ children }) => (
  <svg className="button-icon" viewBox="0 0 16 16" aria-hidden="true">
    {children}
  </svg>
)

const PlusIcon = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Icon>
)

const PencilIcon = () => (
  <Icon>
    <path d="M3 11.5 11.8 2.7a1.4 1.4 0 0 1 2 2L5 13.5 2.5 14l.5-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </Icon>
)

const HistoryIcon = () => (
  <Icon>
    <path d="M3.5 4.5V1.8M3.5 1.8H6M3.5 1.8A6 6 0 1 1 2 6.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 4.8v3.4l2.2 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
)

const CheckIcon = () => (
  <Icon>
    <path d="m3.2 8.2 3 3 6.6-6.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
)

const TrashIcon = () => (
  <Icon>
    <path d="M3 4.5h10M6.2 4.5V3.2h3.6v1.3M5.2 6.2v5.3M8 6.2v5.3M10.8 6.2v5.3M4.3 4.5l.5 8.3h6.4l.5-8.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
)

function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [auth, setAuth] = useState(() => ({
    token: localStorage.getItem('tm_token') || '',
    username: localStorage.getItem('tm_username') || '',
    role: localStorage.getItem('tm_role') || 'USER',
    avatarUrl: localStorage.getItem('tm_avatar_url') || '',
    displayName: localStorage.getItem('tm_display_name') || toDisplayName(localStorage.getItem('tm_username') || ''),
    givenName: localStorage.getItem('tm_given_name') || '',
    familyName: localStorage.getItem('tm_family_name') || '',
    maskedEmail: localStorage.getItem('tm_masked_email') || '',
  }))
  const [route, setRoute] = useState(() => parseRouteFromHash())
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [loginChallenge, setLoginChallenge] = useState({ challengeToken: '', maskedEmail: '', code: '' })
  const [resetRequestEmail, setResetRequestEmail] = useState('')
  const [passwordResetChallenge, setPasswordResetChallenge] = useState({
    challengeToken: '',
    maskedEmail: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [deadlineFilter, setDeadlineFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const lastFetchedTokenRef = useRef('')
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    subjectName: '',
    category: 'WITHOUT_DEADLINE',
    deadline: '',
  })
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    subjectName: '',
    category: 'WITHOUT_DEADLINE',
    deadline: '',
    completed: false,
  })
  const [historyEntries, setHistoryEntries] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [adminUsers, setAdminUsers] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')

  const API_URL = 'http://localhost:8080/api/tasks'
  const AUTH_URL = 'http://localhost:8080/api/auth'
  const PROFILE_URL = 'http://localhost:8080/api/users/me'
  const ADMIN_URL = 'http://localhost:8080/api/admin'

  const normalizeAuthState = (data, fallbackUsername = '') => {
    const username = (data?.username || fallbackUsername || '').trim()
    const displayName = (data?.displayName || '').trim() || toDisplayName(username)
    return {
      token: (data?.token || '').trim(),
      username,
      role: data?.role || 'USER',
      avatarUrl: data?.avatarUrl || '',
      displayName,
      givenName: data?.givenName || '',
      familyName: data?.familyName || '',
      maskedEmail: data?.maskedEmail || '',
    }
  }

  const persistAuthState = (nextAuth) => {
    localStorage.setItem('tm_token', nextAuth.token)
    localStorage.setItem('tm_username', nextAuth.username)
    localStorage.setItem('tm_role', nextAuth.role)
    localStorage.setItem('tm_avatar_url', nextAuth.avatarUrl)
    localStorage.setItem('tm_display_name', nextAuth.displayName)
    localStorage.setItem('tm_given_name', nextAuth.givenName)
    localStorage.setItem('tm_family_name', nextAuth.familyName)
    localStorage.setItem('tm_masked_email', nextAuth.maskedEmail)
  }

  const resetPendingLoginChallenge = () => {
    setLoginChallenge({ challengeToken: '', maskedEmail: '', code: '' })
  }

  const resetPasswordResetFlow = () => {
    setResetRequestEmail('')
    setPasswordResetChallenge({
      challengeToken: '',
      maskedEmail: '',
      code: '',
      newPassword: '',
      confirmPassword: '',
    })
  }

  const authHeaders = (contentType = false) => {
    const headers = {}
    if (contentType) {
      headers['Content-Type'] = 'application/json'
    }
    if (auth.token) {
      headers.Authorization = `Bearer ${auth.token}`
    }
    return headers
  }

  const navigate = (page, taskId = null) => {
    const nextHash = buildHash(page, taskId)
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    } else {
      setRoute(parseRouteFromHash())
    }
  }

  const fetchTasks = async () => {
    setLoading(true)
    setError('')

    if (!auth.token) {
      setTasks([])
      setLoading(false)
      return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      const response = await fetch(API_URL, {
        headers: authHeaders(),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('UNAUTHORIZED')
        }
        throw new Error('API error: ' + response.status)
      }

      const data = await response.json()
      setTasks(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.message === 'UNAUTHORIZED') {
        logout(false)
        setError('Session expirée. Reconnecte-toi.')
        return
      }
      if (err.name === 'AbortError') {
        setError('Le backend met trop de temps à répondre.')
        setTasks([])
        return
      }
      setError('Impossible de charger les tâches depuis le backend Java.')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const syncRoute = () => setRoute(parseRouteFromHash())
    window.addEventListener('hashchange', syncRoute)
    syncRoute()
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  useEffect(() => {
    if (!auth.token) {
      lastFetchedTokenRef.current = ''
      fetchTasks()
      return
    }

    if (lastFetchedTokenRef.current === auth.token) {
      return
    }

    lastFetchedTokenRef.current = auth.token
    fetchTasks()
  }, [auth.token])

  useEffect(() => {
    if (!auth.token || route.page !== 'home' || searchTerm.trim() === '') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      fetchTasks()
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [searchTerm, route.page, auth.token])

  useEffect(() => {
    const loadProfile = async () => {
      if (!auth.token) {
        return
      }

      try {
        const response = await fetch(PROFILE_URL, {
          headers: authHeaders(),
        })

        if (!response.ok) {
          if (response.status === 401) {
            logout(false)
          }
          return
        }

        const data = await response.json()
        const nextAuth = normalizeAuthState({
          ...data,
          token: auth.token,
        }, auth.username)
        setAuth(nextAuth)
        persistAuthState(nextAuth)
      } catch {
        // Ignore profile refresh errors to keep task UX responsive.
      }
    }

    loadProfile()
  }, [auth.token])

  const fetchAdminUsers = async () => {
    if (!auth.token || auth.role !== 'ADMIN') return
    setAdminLoading(true)
    setAdminError('')
    try {
      const response = await fetch(`${ADMIN_URL}/users`, { headers: authHeaders() })
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session admin expirée. Reconnecte-toi.')
        }
        if (response.status === 403) {
          throw new Error('Accès refusé: compte non administrateur.')
        }
        throw new Error('Erreur chargement utilisateurs')
      }
      const data = await response.json()
      setAdminUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setAdminError(err.message || 'Impossible de charger les utilisateurs.')
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    if (route.page === 'admin' && auth.token && auth.role === 'ADMIN') {
      fetchAdminUsers()
    }
  }, [route.page, auth.token])

  useEffect(() => {
    if (route.page !== 'edit' || route.taskId === null) {
      return
    }

    const task = tasks.find((item) => item.id === route.taskId)
    if (!task) {
      return
    }

    setEditForm({
      title: task.title ?? '',
      description: task.description ?? '',
      priority: task.priority ?? 'MEDIUM',
      subjectName: task.subjectName ?? '',
      category:
        task.category ??
        (task.type === 'DEADLINE' || task.type === 'WITH_DEADLINE'
          ? 'WITH_DEADLINE'
          : 'WITHOUT_DEADLINE'),
      deadline: task.deadline ?? '',
      completed: Boolean(task.completed),
    })
  }, [route.page, route.taskId, tasks])

  useEffect(() => {
    const fetchHistory = async () => {
      if (route.page !== 'history' || route.taskId === null || !auth.token) {
        return
      }

      setHistoryLoading(true)
      setHistoryError('')
      try {
        const response = await fetch(`${API_URL}/${route.taskId}/history`, {
          headers: authHeaders(),
        })
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('UNAUTHORIZED')
          }
          throw new Error('HISTORY_FAILED')
        }
        const data = await response.json()
        setHistoryEntries(Array.isArray(data) ? data : [])
      } catch (err) {
        if (err.message === 'UNAUTHORIZED') {
          logout(false)
          setHistoryError('Session expirée. Reconnecte-toi.')
        } else {
          setHistoryError("Impossible de charger l'historique.")
        }
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [route.page, route.taskId, auth.token])

  const resetCreateForm = () => {
    setCreateForm({
      title: '',
      description: '',
      priority: 'MEDIUM',
      subjectName: '',
      category: 'WITHOUT_DEADLINE',
      deadline: '',
    })
  }

  const createTask = async (event) => {
    event.preventDefault()
    setError('')

    const payload = {
      title: createForm.title,
      description: createForm.description,
      priority: createForm.priority,
      subjectName: createForm.subjectName.trim() === '' ? null : createForm.subjectName.trim(),
      category: createForm.category,
      deadline:
        createForm.category === 'WITH_DEADLINE' && createForm.deadline.trim() !== ''
          ? createForm.deadline
          : null,
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          ...payload,
          completed: false,
        }),
      })

      if (!response.ok) {
        throw new Error('Create failed')
      }

      resetCreateForm()
      await fetchTasks()
      navigate('home')
    } catch {
      setError('Impossible de créer la tâche.')
    }
  }

  const openEditPage = (taskId) => navigate('edit', taskId)

  const openHistoryPage = (taskId) => navigate('history', taskId)

  const saveEditedTask = async (event) => {
    event.preventDefault()
    if (route.taskId === null) {
      return
    }
    setError('')

    const payload = {
      title: editForm.title,
      description: editForm.description,
      priority: editForm.priority,
      subjectName: editForm.subjectName.trim() === '' ? null : editForm.subjectName.trim(),
      category: editForm.category,
      deadline:
        editForm.category === 'WITH_DEADLINE' && editForm.deadline.trim() !== ''
          ? editForm.deadline
          : null,
      completed: Boolean(editForm.completed),
    }

    try {
      const response = await fetch(`${API_URL}/${route.taskId}`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error('Update failed')
      }
      await fetchTasks()
      navigate('home')
    } catch {
      setError('Impossible de modifier la tâche.')
    }
  }

  const completeTask = async (id) => {
    setError('')
    try {
      const response = await fetch(`${API_URL}/${id}/complete`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      if (!response.ok) {
        throw new Error('Complete failed')
      }
      await fetchTasks()
    } catch {
      setError('Impossible de terminer la tâche.')
    }
  }

  const deleteTask = async (id) => {
    setError('')
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!response.ok) {
        throw new Error('Delete failed')
      }
      await fetchTasks()
    } catch {
      setError('Impossible de supprimer la tâche.')
    }
  }

  const getPriorityClass = (priority) => {
    const value = (priority || '').toLowerCase()
    if (value === 'critical') return 'critical'
    if (value === 'high') return 'high'
    if (value === 'medium') return 'medium'
    return 'low'
  }

  const getDeadlineModeLabel = (category, deadline) => {
    if (category === 'WITH_DEADLINE' || (deadline ?? '') !== '') {
      return 'Avec deadline'
    }
    return 'Sans deadline'
  }

  const getDeadlineModeValue = (category, deadline) =>
    category === 'WITH_DEADLINE' || (deadline ?? '') !== '' ? 'WITH_DEADLINE' : 'WITHOUT_DEADLINE'

  const formatHistoryDate = (value) => {
    if (!value) return '-'
    const parsed = new Date(String(value).replace(' ', 'T'))
    if (Number.isNaN(parsed.getTime())) {
      return String(value).replace('T', ' ')
    }
    return parsed.toLocaleString('fr-FR')
  }

  const getHistoryFieldRawValue = (entry, key) => {
    if (!entry) return null
    if (key === 'status') return Boolean(entry.completed)
    if (key === 'mode') return getDeadlineModeValue(entry.category, entry.deadline)
    if (key === 'deadline') return entry.deadline || ''
    if (key === 'subjectName') return (entry.subjectName || '').trim()
    return entry[key] ?? ''
  }

  const getHistoryFieldDisplayValue = (entry, key) => {
    if (!entry) return '-'
    if (key === 'status') return entry.completed ? 'Terminée' : 'En cours'
    if (key === 'mode') return getDeadlineModeLabel(entry.category, entry.deadline)
    if (key === 'deadline') return entry.deadline || '-'
    if (key === 'subjectName') return entry.subjectName || '-'
    return entry[key] || '-'
  }

  const getHistoryChanges = (entry, index) => {
    const previous = historyEntries[index + 1]
    const fields = [
      { key: 'title', label: 'Titre' },
      { key: 'description', label: 'Description' },
      { key: 'priority', label: 'Priorité' },
      { key: 'status', label: 'État' },
      { key: 'mode', label: 'Mode' },
      { key: 'deadline', label: 'Deadline' },
      { key: 'subjectName', label: 'Matière' },
    ]

    if (!previous) {
      return fields.map((field) => ({
        label: field.label,
        before: '-',
        after: getHistoryFieldDisplayValue(entry, field.key),
      }))
    }

    const changes = fields
      .filter((field) => getHistoryFieldRawValue(entry, field.key) !== getHistoryFieldRawValue(previous, field.key))
      .map((field) => ({
        label: field.label,
        before: getHistoryFieldDisplayValue(previous, field.key),
        after: getHistoryFieldDisplayValue(entry, field.key),
      }))

    if (entry.action === 'DELETED' && changes.length === 0) {
      return [{ label: 'Statut', before: 'Active', after: 'Supprimée' }]
    }

    return changes
  }

  const subjectOptions = Array.from(
    new Set(
      tasks
        .map((task) => (task.subjectName ?? '').trim())
        .filter((subjectName) => subjectName !== ''),
    ),
  ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    subjectFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    deadlineFilter !== 'ALL' ||
    statusFilter !== 'ALL'

  const filteredTasks = tasks.filter((task) => {
    const needle = normalizeText(searchTerm.trim())

    if (subjectFilter !== 'ALL' && (task.subjectName ?? '') !== subjectFilter) {
      return false
    }

    if (priorityFilter !== 'ALL' && (task.priority ?? 'LOW') !== priorityFilter) {
      return false
    }

    const taskMode = getDeadlineModeValue(task.category ?? task.type, task.deadline)
    if (deadlineFilter !== 'ALL' && taskMode !== deadlineFilter) {
      return false
    }

    if (statusFilter === 'DONE' && !task.completed) {
      return false
    }

    if (statusFilter === 'TODO' && task.completed) {
      return false
    }

    if (needle === '') return true

    const haystack = [
      String(task.id ?? ''),
      task.title ?? '',
      task.description ?? '',
      task.subjectName ?? '',
      task.priority ?? '',
      task.category ?? '',
      task.type ?? '',
      task.completed ? 'terminée terminee' : 'en cours',
      task.deadline ?? '',
    ]
      .join(' ')
    const normalizedHaystack = normalizeText(haystack)

    return normalizedHaystack.includes(needle)
  })

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE
  const paginatedTasks = filteredTasks.slice(pageStart, pageStart + PAGE_SIZE)

  const visibleStart = filteredTasks.length === 0 ? 0 : pageStart + 1
  const visibleEnd = filteredTasks.length === 0 ? 0 : Math.min(pageStart + PAGE_SIZE, filteredTasks.length)

  const pageWindowSize = 5
  const windowStart = Math.max(1, safeCurrentPage - Math.floor(pageWindowSize / 2))
  const windowEnd = Math.min(totalPages, windowStart + pageWindowSize - 1)
  const adjustedWindowStart = Math.max(1, windowEnd - pageWindowSize + 1)
  const visiblePageNumbers = Array.from(
    { length: windowEnd - adjustedWindowStart + 1 },
    (_, index) => adjustedWindowStart + index,
  )

  const exportFilteredTasksToExcel = () => {
    const rows = filteredTasks.map((task) => ({
      ID: task.id,
      Titre: task.title ?? '',
      Description: task.description ?? '',
      Priorite: task.priority ?? 'LOW',
      Mode: getDeadlineModeLabel(task.category ?? task.type, task.deadline),
      Etat: task.completed ? 'Terminee' : 'En cours',
      Matiere: task.subjectName ?? '',
      Deadline: task.deadline ?? '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    XLSX.writeFile(workbook, `tasks-export-${timestamp}.xlsx`)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, subjectFilter, priorityFilter, deadlineFilter, statusFilter])

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(prev, 1), totalPages))
  }, [totalPages])

  const handleAuth = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      const loginOrEmail = authForm.username.trim()
      const password = authForm.password

      if (loginOrEmail === '' || password.trim() === '') {
        throw new Error('Adresse e-mail/login et mot de passe requis.')
      }

      if (authMode === 'register') {
        if (!EMAIL_REGEX.test(loginOrEmail)) {
          throw new Error('Adresse e-mail invalide.')
        }

        if (password.length < 12 || !SPECIAL_CHAR_REGEX.test(password)) {
          throw new Error('Le mot de passe doit contenir au moins 12 caractères et 1 caractère spécial.')
        }
      }

      const endpoint = authMode === 'login' ? 'login' : 'register'
      const response = await fetch(`${AUTH_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginOrEmail,
          password,
        }),
      })

      if (authMode === 'login' && response.status === 202) {
        const challengeData = await response.json()
        if (!challengeData?.challengeToken) {
          throw new Error('Verification de connexion indisponible.')
        }
        setLoginChallenge({
          challengeToken: challengeData.challengeToken,
          maskedEmail: challengeData.maskedEmail || loginOrEmail,
          code: '',
        })
        setAuthError('')
        return
      }

      if (!response.ok) {
        let serverMessage = ''
        try {
          const data = await response.json()
          serverMessage = data?.error || ''
        } catch {
          serverMessage = ''
        }

        if (response.status === 400 && serverMessage !== '') {
          throw new Error(serverMessage)
        }
        if (response.status === 401) {
          throw new Error('Identifiants invalides.')
        }
        if (response.status === 409) {
          throw new Error('Adresse e-mail deja prise.')
        }
        throw new Error('Echec authentification.')
      }

      const data = await response.json()
      const nextAuth = normalizeAuthState(data, loginOrEmail)

      persistAuthState(nextAuth)
      setAuth(nextAuth)
      setAuthForm({ username: '', password: '' })
      resetPendingLoginChallenge()
      navigate('home')
    } catch (err) {
      setAuthError(err.message || 'Erreur authentification.')
    } finally {
      setAuthLoading(false)
    }
  }

  const verifyLoginCode = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      if (loginChallenge.challengeToken.trim() === '' || loginChallenge.code.trim() === '') {
        throw new Error('Code de verification requis.')
      }

      const response = await fetch(`${AUTH_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: loginChallenge.challengeToken,
          code: loginChallenge.code.trim(),
        }),
      })

      if (!response.ok) {
        let serverMessage = ''
        try {
          const data = await response.json()
          serverMessage = data?.error || ''
        } catch {
          serverMessage = ''
        }
        throw new Error(serverMessage || 'Code invalide ou expire.')
      }

      const data = await response.json()
      const nextAuth = normalizeAuthState(data, authForm.username.trim())

      persistAuthState(nextAuth)
      setAuth(nextAuth)
      setAuthForm({ username: '', password: '' })
      resetPendingLoginChallenge()
      navigate('home')
    } catch (err) {
      setAuthError(err.message || 'Verification impossible.')
    } finally {
      setAuthLoading(false)
    }
  }

  const requestPasswordReset = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      const username = resetRequestEmail.trim()
      if (username === '') {
        throw new Error('Adresse e-mail requise.')
      }

      const response = await fetch(`${AUTH_URL}/password/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })

      if (response.status === 202) {
        const data = await response.json()
        if (!data?.challengeToken) {
          throw new Error('Demande de reinitialisation indisponible.')
        }
        setPasswordResetChallenge({
          challengeToken: data.challengeToken,
          maskedEmail: data.maskedEmail || username,
          code: '',
          newPassword: '',
          confirmPassword: '',
        })
        setAuthMode('reset-verify')
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Impossible de lancer la reinitialisation.')
      }

      setAuthError('Si ce compte existe, un code va etre envoye par e-mail.')
      setAuthMode('login')
      resetPasswordResetFlow()
    } catch (err) {
      setAuthError(err.message || 'Erreur reinitialisation.')
    } finally {
      setAuthLoading(false)
    }
  }

  const confirmPasswordReset = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      if (passwordResetChallenge.code.trim() === '') {
        throw new Error('Code de verification requis.')
      }
      if (passwordResetChallenge.newPassword.length < 12 || !SPECIAL_CHAR_REGEX.test(passwordResetChallenge.newPassword)) {
        throw new Error('Le mot de passe doit contenir au moins 12 caracteres et 1 caractere special.')
      }
      if (passwordResetChallenge.newPassword !== passwordResetChallenge.confirmPassword) {
        throw new Error('La confirmation du mot de passe ne correspond pas.')
      }

      const response = await fetch(`${AUTH_URL}/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: passwordResetChallenge.challengeToken,
          code: passwordResetChallenge.code.trim(),
          newPassword: passwordResetChallenge.newPassword,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Code invalide ou expire.')
      }

      setAuthMode('login')
      resetPasswordResetFlow()
      setAuthError('Mot de passe mis a jour. Vous pouvez vous connecter.')
    } catch (err) {
      setAuthError(err.message || 'Impossible de reinitialiser le mot de passe.')
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = (clearUi = true) => {
    lastFetchedTokenRef.current = ''
    localStorage.removeItem('tm_token')
    localStorage.removeItem('tm_username')
    localStorage.removeItem('tm_role')
    localStorage.removeItem('tm_avatar_url')
    localStorage.removeItem('tm_display_name')
    localStorage.removeItem('tm_given_name')
    localStorage.removeItem('tm_family_name')
    localStorage.removeItem('tm_masked_email')
    setAuth({
      token: '',
      username: '',
      role: 'USER',
      avatarUrl: '',
      displayName: '',
      givenName: '',
      familyName: '',
      maskedEmail: '',
    })
    setTasks([])
    setHistoryEntries([])
    setHistoryError('')
    resetPendingLoginChallenge()
    resetPasswordResetFlow()
    navigate('home')
    if (clearUi) {
      setError('')
      setAuthError('')
    }
  }

  const profileDisplayName = (auth.displayName || '').trim() || toDisplayName(auth.username)
  const profileGivenName = (auth.givenName || '').trim() || profileDisplayName.split(' ')[0] || '—'
  const profileFamilyName = (auth.familyName || '').trim() || (profileDisplayName.split(' ').slice(1).join(' ') || '—')
  const profileAccountType = auth.role === 'ADMIN' ? 'Administrateur' : 'Utilisateur'
  const avatarInitial = (profileDisplayName || '?').slice(0, 1).toUpperCase()
  const routeTask = route.taskId === null ? null : tasks.find((task) => task.id === route.taskId)
  const todayIso = new Date().toISOString().slice(0, 10)
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => Boolean(task.completed)).length
  const todoTasks = totalTasks - completedTasks
  const overdueTasks = tasks.filter((task) => !task.completed && task.deadline && task.deadline < todayIso).length
  const criticalOpenTasks = tasks.filter((task) => !task.completed && String(task.priority || '').toUpperCase() === 'CRITICAL').length
  const dueSoonTasks = tasks.filter((task) => {
    if (task.completed || !task.deadline) return false
    const timeDiff = new Date(task.deadline).getTime() - new Date(todayIso).getTime()
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 3
  }).length
  const noDeadlineTasks = tasks.filter((task) => !task.deadline).length
  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)
  const priorityDistribution = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => {
    const count = tasks.filter((task) => String(task.priority || 'LOW').toUpperCase() === level).length
    const percent = totalTasks === 0 ? 0 : Math.round((count / totalTasks) * 100)
    return { level, count, percent }
  })
  const lateTasks = tasks
    .filter((task) => !task.completed && task.deadline && task.deadline < todayIso)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 5)
  const topCriticalTasks = tasks
    .filter((task) => !task.completed && String(task.priority || '').toUpperCase() === 'CRITICAL')
    .slice(0, 5)
  const adminDeleteUser = async (userId) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return
    try {
      const response = await fetch(`${ADMIN_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setAdminError(data?.error || 'Suppression échouée.')
        return
      }
      setAdminUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch {
      setAdminError('Impossible de supprimer cet utilisateur.')
    }
  }

  const adminChangeRole = async (userId, currentRole) => {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN'
    try {
      const response = await fetch(`${ADMIN_URL}/users/${userId}/role`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({ role: newRole }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setAdminError(data?.error || 'Modification rôle échouée.')
        return
      }
      setAdminUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    } catch {
      setAdminError('Impossible de modifier le rôle.')
    }
  }

  const currentPageLabel =
    route.page === 'dashboard'
      ? 'Tableau de bord'
      : route.page === 'create'
      ? 'Nouvelle tâche'
      : route.page === 'edit'
        ? `Modifier #${route.taskId ?? ''}`
        : route.page === 'history'
          ? `Historique #${route.taskId ?? ''}`
          : route.page === 'profile'
            ? 'Mon profil'
            : route.page === 'admin'
              ? 'Administration'
              : 'Accueil'
  const isTasksSection = ['home', 'create', 'edit', 'history'].includes(route.page)

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="page-title-block">
          <h1>Task Manager UI</h1>
        </div>
        <div className="header-actions">
          {auth.token ? (
            <>
              <button
                type="button"
                className="user-badge user-badge-btn"
                onClick={() => navigate('profile')}
                title="Voir mon profil"
                aria-label="Voir mon profil"
              >
                {auth.avatarUrl ? (
                  <img
                    className="user-avatar"
                    src={auth.avatarUrl}
                    alt="Photo de profil"
                    onError={() => {
                      const nextAuth = { ...auth, avatarUrl: '' }
                      setAuth(nextAuth)
                      localStorage.setItem('tm_avatar_url', '')
                    }}
                  />
                ) : (
                  <span className="user-avatar-fallback">{avatarInitial}</span>
                )}
                <span>
                  <strong>{profileDisplayName}</strong>
                  <small>{auth.role}{auth.maskedEmail ? ` • ${auth.maskedEmail}` : ''}</small>
                </span>
              </button>
              <button className="cancel-btn" onClick={() => logout()}>
                Se déconnecter
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!auth.token && (
        <section className="form-panel">
          <h2>{authMode === 'register' ? 'Inscription' : authMode === 'reset-request' || authMode === 'reset-verify' ? 'Reinitialiser le mot de passe' : 'Connexion'}</h2>
          {authMode === 'login' && loginChallenge.challengeToken ? (
            <form className="task-form" onSubmit={verifyLoginCode}>
              <input
                type="text"
                placeholder={`Code reçu sur ${loginChallenge.maskedEmail}`}
                value={loginChallenge.code}
                onChange={(e) =>
                  setLoginChallenge((prev) => ({
                    ...prev,
                    code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  }))
                }
                inputMode="numeric"
                pattern="^\d{6}$"
                title="Entrez le code a 6 chiffres recu par e-mail"
                required
              />
              <button type="submit" className="create-btn" disabled={authLoading}>
                {authLoading ? 'Verification...' : 'Verifier le code'}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setAuthError('')
                  resetPendingLoginChallenge()
                }}
                disabled={authLoading}
              >
                Retour
              </button>
            </form>
          ) : authMode === 'reset-request' ? (
            <form className="task-form" onSubmit={requestPasswordReset}>
              <input
                type="text"
                placeholder="Adresse e-mail"
                value={resetRequestEmail}
                onChange={(e) => setResetRequestEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <button type="submit" className="create-btn" disabled={authLoading}>
                {authLoading ? 'Envoi...' : 'Recevoir un code'}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setAuthError('')
                  setAuthMode('login')
                  resetPasswordResetFlow()
                }}
                disabled={authLoading}
              >
                Retour connexion
              </button>
            </form>
          ) : authMode === 'reset-verify' ? (
            <form className="task-form" onSubmit={confirmPasswordReset}>
              <input
                type="text"
                placeholder={`Code recu sur ${passwordResetChallenge.maskedEmail}`}
                value={passwordResetChallenge.code}
                onChange={(e) =>
                  setPasswordResetChallenge((prev) => ({
                    ...prev,
                    code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  }))
                }
                inputMode="numeric"
                pattern="^\d{6}$"
                title="Entrez le code a 6 chiffres recu par e-mail"
                required
              />
              <input
                type="password"
                placeholder="Nouveau mot de passe (12+ chars + special)"
                value={passwordResetChallenge.newPassword}
                onChange={(e) =>
                  setPasswordResetChallenge((prev) => ({
                    ...prev,
                    newPassword: e.target.value,
                  }))
                }
                minLength={12}
                pattern="^(?=.*[^A-Za-z0-9]).{12,}$"
                title="Minimum 12 caracteres, avec au moins un caractere special."
                autoComplete="new-password"
                required
              />
              <input
                type="password"
                placeholder="Confirmer le mot de passe"
                value={passwordResetChallenge.confirmPassword}
                onChange={(e) =>
                  setPasswordResetChallenge((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                autoComplete="new-password"
                required
              />
              <button type="submit" className="create-btn" disabled={authLoading}>
                {authLoading ? 'Verification...' : 'Mettre a jour le mot de passe'}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setAuthError('')
                  setAuthMode('reset-request')
                  setPasswordResetChallenge((prev) => ({
                    ...prev,
                    challengeToken: '',
                    code: '',
                    newPassword: '',
                    confirmPassword: '',
                  }))
                }}
                disabled={authLoading}
              >
                Recommencer
              </button>
            </form>
          ) : (
            <form className="task-form" onSubmit={handleAuth}>
              <input
                type={authMode === 'register' ? 'email' : 'text'}
                placeholder={authMode === 'register' ? 'Adresse e-mail' : 'Adresse e-mail (admin legacy autorise)'}
                value={authForm.username}
                onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                autoComplete={authMode === 'register' ? 'email' : 'username'}
                required
              />
              <input
                type="password"
                placeholder={authMode === 'register' ? 'Mot de passe (12+ chars + special)' : 'Mot de passe'}
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                minLength={authMode === 'register' ? 12 : undefined}
                pattern={authMode === 'register' ? '^(?=.*[^A-Za-z0-9]).{12,}$' : undefined}
                title={
                  authMode === 'register'
                    ? 'Minimum 12 caracteres, avec au moins un caractere special.'
                    : undefined
                }
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                required
              />
              <button type="submit" className="create-btn" disabled={authLoading}>
                {authLoading ? 'Chargement...' : authMode === 'login' ? 'Se connecter' : "S'inscrire"}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setAuthError('')
                  resetPendingLoginChallenge()
                  resetPasswordResetFlow()
                  setAuthMode(authMode === 'login' ? 'register' : 'login')
                }}
              >
                {authMode === 'login' ? 'Créer un compte' : "J'ai déjà un compte"}
              </button>
              {authMode === 'login' && (
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setAuthError('')
                    resetPendingLoginChallenge()
                    setAuthMode('reset-request')
                  }}
                >
                  Mot de passe oublie ?
                </button>
              )}
            </form>
          )}
          {authError && <p className="error-text">{authError}</p>}
        </section>
      )}

      {auth.token && (
        <div className="workspace-layout">
          <aside className="app-sidebar" aria-label="Navigation principale">
            <button
              type="button"
              className={`sidebar-link ${route.page === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigate('dashboard')}
            >
              Tableau de bord
            </button>
            <button
              type="button"
              className={`sidebar-link ${isTasksSection ? 'active' : ''}`}
              onClick={() => navigate('home')}
            >
              Recherche & tâches
            </button>
            {auth.role === 'ADMIN' && (
              <button
                type="button"
                className={`sidebar-link ${route.page === 'admin' ? 'active' : ''}`}
                onClick={() => navigate('admin')}
              >
                Admin
              </button>
            )}
          </aside>

          <div className="workspace-main">
            <nav className="breadcrumb" aria-label="Fil d'ariane">
              <button
                className="breadcrumb-link"
                type="button"
                onClick={() => navigate('dashboard')}
                disabled={route.page === 'dashboard'}
              >
                Tableau de bord
              </button>
              {route.page !== 'dashboard' && (
                <>
                  <span className="breadcrumb-sep">/</span>
                  <span className="breadcrumb-current">{currentPageLabel}</span>
                </>
              )}
            </nav>

            <section className="status-panel">
              {loading && <p>Chargement des tâches...</p>}
              {!loading && error && <p className="error-text">{error}</p>}
              {!loading && !error && (
                <p>
                  {visibleStart}-{visibleEnd} / {filteredTasks.length} tâche(s) filtrée(s), sur {tasks.length} totale(s)
                </p>
              )}
            </section>

            {route.page === 'dashboard' && (
              <>
                <section className="dashboard-grid">
                  <article className="dashboard-card">
                    <h3>Total tâches</h3>
                    <p>{totalTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Terminées</h3>
                    <p>{completedTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>En cours</h3>
                    <p>{todoTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>En retard</h3>
                    <p>{overdueTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Deadline ≤ 3 jours</h3>
                    <p>{dueSoonTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Sans deadline</h3>
                    <p>{noDeadlineTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Critiques ouvertes</h3>
                    <p>{criticalOpenTasks}</p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Taux de complétion</h3>
                    <p>{completionRate}%</p>
                  </article>
                </section>

                <section className="dashboard-panels">
                  <article className="dashboard-panel">
                    <h3>Répartition des priorités</h3>
                    <div className="kpi-bars">
                      {priorityDistribution.map((item) => (
                        <div className="kpi-bar-row" key={item.level}>
                          <span className="kpi-bar-label">{item.level}</span>
                          <div className="kpi-bar-track" role="presentation">
                            <div className={`kpi-bar-fill priority-${item.level.toLowerCase()}`} style={{ width: `${item.percent}%` }} />
                          </div>
                          <span className="kpi-bar-value">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="dashboard-panel">
                    <h3>Alertes</h3>
                    <div className="dashboard-list-block">
                      <h4>Tâches en retard</h4>
                      {lateTasks.length === 0 ? (
                        <p>Aucune tâche en retard.</p>
                      ) : (
                        <ul className="dashboard-list">
                          {lateTasks.map((task) => (
                            <li key={`late-${task.id}`}>#{task.id} • {task.title} (deadline {task.deadline})</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="dashboard-list-block">
                      <h4>Critiques ouvertes</h4>
                      {topCriticalTasks.length === 0 ? (
                        <p>Aucune tâche critique ouverte.</p>
                      ) : (
                        <ul className="dashboard-list">
                          {topCriticalTasks.map((task) => (
                            <li key={`critical-${task.id}`}>#{task.id} • {task.title}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                </section>
              </>
            )}

          {route.page === 'home' && (
            <>
              <section className="subpage-nav">
                <button className="create-btn" onClick={() => navigate('create')}>
                  <PlusIcon />
                  <span>Ajouter une tâche</span>
                </button>
              </section>

              <section className="search-panel">
                <input
                  className="search-input"
                  type="text"
                  placeholder="Rechercher une tâche (titre, matière, priorité, ID...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                  className="search-filter-select"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                >
                  <option value="ALL">Toutes les matières</option>
                  {subjectOptions.map((subjectName) => (
                    <option key={subjectName} value={subjectName}>
                      {subjectName}
                    </option>
                  ))}
                </select>
                <select
                  className="search-filter-select"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="ALL">Toutes priorités</option>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <select
                  className="search-filter-select"
                  value={deadlineFilter}
                  onChange={(e) => setDeadlineFilter(e.target.value)}
                >
                  <option value="ALL">Tous modes</option>
                  <option value="WITHOUT_DEADLINE">Sans deadline</option>
                  <option value="WITH_DEADLINE">Avec deadline</option>
                </select>
                <select
                  className="search-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tous états</option>
                  <option value="TODO">En cours</option>
                  <option value="DONE">Terminée</option>
                </select>
                {hasActiveFilters && (
                  <button
                    className="clear-search-btn"
                    onClick={() => {
                      setSearchTerm('')
                      setSubjectFilter('ALL')
                      setPriorityFilter('ALL')
                      setDeadlineFilter('ALL')
                      setStatusFilter('ALL')
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
                <button
                  type="button"
                  className="export-excel-btn"
                  onClick={exportFilteredTasksToExcel}
                  disabled={filteredTasks.length === 0}
                  title={filteredTasks.length === 0 ? 'Aucune tache a exporter' : 'Exporter les taches filtrees vers Excel'}
                >
                  Exporter Excel ({filteredTasks.length})
                </button>
              </section>

              <section className="table-shell">
                <div className="task-table-wrapper">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Titre</th>
                        <th>Description</th>
                        <th>Priorité</th>
                        <th>Mode</th>
                        <th>État</th>
                        <th>Matière</th>
                        <th>Deadline</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loading && !error && filteredTasks.length === 0 && (
                        <tr>
                          <td colSpan={9} className="empty-cell">
                            {!hasActiveFilters
                              ? 'Aucune tâche trouvée.'
                              : 'Aucun résultat pour cette recherche ou ces filtres.'}
                          </td>
                        </tr>
                      )}

                      {!loading &&
                        !error &&
                        paginatedTasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.id}</td>
                            <td>{task.title}</td>
                            <td className="description-cell">{task.description}</td>
                            <td>
                              <span className={'priority-badge ' + getPriorityClass(task.priority)}>
                                {task.priority || 'LOW'}
                              </span>
                            </td>
                            <td>{getDeadlineModeLabel(task.category ?? task.type, task.deadline)}</td>
                            <td>{task.completed ? 'Terminée' : 'En cours'}</td>
                            <td>{task.subjectName || '-'}</td>
                            <td>{task.deadline || '-'}</td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="edit-btn icon-btn"
                                  onClick={() => openEditPage(task.id)}
                                  aria-label={`Modifier la tâche ${task.id}`}
                                  title="Modifier"
                                >
                                  <PencilIcon />
                                </button>
                                <button
                                  className="history-btn icon-btn"
                                  onClick={() => openHistoryPage(task.id)}
                                  aria-label={`Voir l'historique de la tâche ${task.id}`}
                                  title="Historique"
                                >
                                  <HistoryIcon />
                                </button>
                                {!task.completed && (
                                  <button
                                    className="done-btn icon-btn"
                                    onClick={() => completeTask(task.id)}
                                    aria-label={`Terminer la tâche ${task.id}`}
                                    title="Terminer"
                                  >
                                    <CheckIcon />
                                  </button>
                                )}
                                <button
                                  className="delete-btn icon-btn"
                                  onClick={() => deleteTask(task.id)}
                                  aria-label={`Supprimer la tâche ${task.id}`}
                                  title="Supprimer"
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {!loading && !error && (
                  <div className="pagination-bar" aria-label="Pagination des tâches">
                    <div className="pagination-info">
                      Page {safeCurrentPage} / {totalPages}
                    </div>
                    <div className="pagination-controls">
                      <button
                        type="button"
                        className="page-btn"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={safeCurrentPage === 1}
                      >
                        Précédent
                      </button>

                      {visiblePageNumbers.map((pageNumber) => (
                        <button
                          key={pageNumber}
                          type="button"
                          className={`page-btn ${pageNumber === safeCurrentPage ? 'active' : ''}`}
                          onClick={() => setCurrentPage(pageNumber)}
                          aria-current={pageNumber === safeCurrentPage ? 'page' : undefined}
                        >
                          {pageNumber}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="page-btn"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={safeCurrentPage === totalPages}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {route.page === 'create' && (
            <section className="form-panel">
              <h2>Nouvelle tâche</h2>
              <form className="task-form" onSubmit={createTask}>
                <input
                  placeholder="Titre"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  required
                />
                <input
                  placeholder="Description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  required
                />
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                >
                  <option value="WITHOUT_DEADLINE">Sans deadline</option>
                  <option value="WITH_DEADLINE">Avec deadline</option>
                </select>
                <input
                  placeholder="Matière (optionnel)"
                  value={createForm.subjectName}
                  onChange={(e) => setCreateForm({ ...createForm, subjectName: e.target.value })}
                />
                {createForm.category === 'WITH_DEADLINE' && (
                  <input
                    type="date"
                    value={createForm.deadline}
                    onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })}
                  />
                )}
                <button type="submit" className="create-btn">
                  Créer
                </button>
                <button type="button" className="cancel-btn" onClick={() => navigate('home')}>
                  Annuler
                </button>
              </form>
            </section>
          )}

          {route.page === 'edit' && (
            <section className="form-panel">
              <h2>{routeTask ? `Modifier la tâche #${routeTask.id}` : 'Tâche introuvable'}</h2>
              {!routeTask ? (
                <p className="error-text">Impossible de charger cette tâche. Retourne à la liste.</p>
              ) : (
                <form className="task-form" onSubmit={saveEditedTask}>
                  <input
                    placeholder="Titre"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    required
                  />
                  <input
                    placeholder="Description"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    required
                  />
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  >
                    <option value="WITHOUT_DEADLINE">Sans deadline</option>
                    <option value="WITH_DEADLINE">Avec deadline</option>
                  </select>
                  <input
                    placeholder="Matière (optionnel)"
                    value={editForm.subjectName}
                    onChange={(e) => setEditForm({ ...editForm, subjectName: e.target.value })}
                  />
                  {editForm.category === 'WITH_DEADLINE' && (
                    <input
                      type="date"
                      value={editForm.deadline}
                      onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                    />
                  )}
                  <button type="submit" className="create-btn">
                    Enregistrer
                  </button>
                  <button type="button" className="cancel-btn" onClick={() => navigate('home')}>
                    Annuler
                  </button>
                </form>
              )}
            </section>
          )}

          {route.page === 'history' && (
            <section className="form-panel">
              <h2>{route.taskId === null ? 'Historique' : `Historique de la tâche #${route.taskId}`}</h2>

              {historyLoading && <p>Chargement de l'historique...</p>}
              {!historyLoading && historyError && <p className="error-text">{historyError}</p>}

              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <p>Aucun historique disponible pour cette tâche.</p>
              )}

              {!historyLoading && !historyError && historyEntries.length > 0 && (
                <div className="history-list">
                  {historyEntries.map((entry, index) => {
                    const changes = getHistoryChanges(entry, index)
                    return (
                    <article className="history-item" key={entry.id}>
                      <div className="history-head">
                        <strong>{entry.action}</strong>
                      </div>
                      <p>
                        <strong>Date de modification:</strong> {formatHistoryDate(entry.changedAt)}
                      </p>
                      {changes.length === 0 ? (
                        <p>Aucun champ métier modifié.</p>
                      ) : (
                        <div className="history-changes">
                          {changes.map((change) => (
                            <p key={`${entry.id}-${change.label}`} className="history-change-line">
                              <strong>{change.label}:</strong> {change.before} → {change.after}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {route.page === 'profile' && (
            <section className="profile-page">
              <div className="profile-page-card">
                <div className="profile-page-avatar-wrap">
                  {auth.avatarUrl ? (
                    <img
                      className="profile-page-avatar-img"
                      src={auth.avatarUrl}
                      alt="Photo de profil"
                      onError={() => {
                        const nextAuth = { ...auth, avatarUrl: '' }
                        setAuth(nextAuth)
                        localStorage.setItem('tm_avatar_url', '')
                      }}
                    />
                  ) : (
                    <span className="profile-page-avatar-fallback">{avatarInitial}</span>
                  )}
                </div>

                <h2 className="profile-page-name">{profileDisplayName}</h2>

                <div className="profile-page-info">
                  <div className="profile-page-field">
                    <span className="profile-page-label">E-mail</span>
                    <span className="profile-page-value profile-page-email">{auth.maskedEmail || '—'}</span>
                  </div>
                  <div className="profile-page-field">
                    <span className="profile-page-label">Identifiant</span>
                    <span className="profile-page-value">{auth.username || '—'}</span>
                  </div>
                  <div className="profile-page-field">
                    <span className="profile-page-label">Prénom</span>
                    <span className="profile-page-value">{profileGivenName}</span>
                  </div>
                  <div className="profile-page-field">
                    <span className="profile-page-label">Nom</span>
                    <span className="profile-page-value">{profileFamilyName}</span>
                  </div>
                  <div className="profile-page-field">
                    <span className="profile-page-label">Type de compte</span>
                    <span className="profile-page-value">{profileAccountType}</span>
                  </div>
                  <div className="profile-page-field">
                    <span className="profile-page-label">Rôle</span>
                    <span className={`profile-page-role-badge role-${(auth.role || 'USER').toLowerCase()}`}>
                      {auth.role || 'USER'}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {route.page === 'admin' && auth.role === 'ADMIN' && (
            <section className="admin-page">
              <div className="admin-page-header">
                <h2>Administration — Utilisateurs</h2>
                <button type="button" className="create-btn" onClick={fetchAdminUsers} disabled={adminLoading}>
                  {adminLoading ? 'Chargement...' : 'Actualiser'}
                </button>
              </div>
              {adminError && <p className="error-text">{adminError}</p>}
              {!adminLoading && adminUsers.length === 0 && !adminError && (
                <p>Aucun utilisateur trouvé.</p>
              )}
              {adminUsers.length > 0 && (
                <div className="admin-table-wrapper">
                  <table className="task-table admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Identité</th>
                        <th>E-mail (masqué)</th>
                        <th>Rôle</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u) => (
                        <tr key={u.id} className={u.id === auth.id ? 'admin-row-self' : ''}>
                          <td>{u.id}</td>
                          <td>{u.displayName || '—'}</td>
                          <td className="admin-masked-email">{u.maskedEmail || '—'}</td>
                          <td>
                            <span className={`profile-page-role-badge role-${(u.role || 'USER').toLowerCase()}`}>
                              {u.role || 'USER'}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="edit-btn icon-btn admin-role-btn"
                                onClick={() => adminChangeRole(u.id, u.role)}
                                title={u.role === 'ADMIN' ? 'Rétrograder en USER' : 'Promouvoir en ADMIN'}
                                disabled={u.id === auth.id}
                              >
                                {u.role === 'ADMIN' ? '↓ USER' : '↑ ADMIN'}
                              </button>
                              <button
                                type="button"
                                className="delete-btn icon-btn"
                                onClick={() => adminDeleteUser(u.id)}
                                title="Supprimer l'utilisateur"
                                disabled={u.id === auth.id}
                                aria-label={`Supprimer l'utilisateur ${u.id}`}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {route.page === 'admin' && auth.role !== 'ADMIN' && (
            <section className="form-panel">
              <p className="error-text">Accès réservé aux administrateurs.</p>
            </section>
          )}
          </div>
        </div>
      )}
    </main>
  )
}

export default App

