import { useEffect, useRef, useState } from 'react'
import './App.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/

const parseRouteFromHash = () => {
  const hash = (window.location.hash || '').replace(/^#/, '')
  const clean = hash.startsWith('/') ? hash : `/${hash}`

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
  }))
  const [route, setRoute] = useState(() => parseRouteFromHash())
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [loginChallenge, setLoginChallenge] = useState({ challengeToken: '', maskedEmail: '', code: '' })
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

  const API_URL = 'http://localhost:8080/api/tasks'
  const AUTH_URL = 'http://localhost:8080/api/auth'

  const resetPendingLoginChallenge = () => {
    setLoginChallenge({ challengeToken: '', maskedEmail: '', code: '' })
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
      const nextAuth = {
        token: data.token || '',
        username: data.username || loginOrEmail,
        role: data.role || 'USER',
        avatarUrl: data.avatarUrl || '',
      }

      localStorage.setItem('tm_token', nextAuth.token)
      localStorage.setItem('tm_username', nextAuth.username)
      localStorage.setItem('tm_role', nextAuth.role)
      localStorage.setItem('tm_avatar_url', nextAuth.avatarUrl)
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
      const nextAuth = {
        token: data.token || '',
        username: data.username || authForm.username.trim(),
        role: data.role || 'USER',
        avatarUrl: data.avatarUrl || '',
      }

      localStorage.setItem('tm_token', nextAuth.token)
      localStorage.setItem('tm_username', nextAuth.username)
      localStorage.setItem('tm_role', nextAuth.role)
      localStorage.setItem('tm_avatar_url', nextAuth.avatarUrl)
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

  const logout = (clearUi = true) => {
    lastFetchedTokenRef.current = ''
    localStorage.removeItem('tm_token')
    localStorage.removeItem('tm_username')
    localStorage.removeItem('tm_role')
    localStorage.removeItem('tm_avatar_url')
    setAuth({ token: '', username: '', role: 'USER', avatarUrl: '' })
    setTasks([])
    setHistoryEntries([])
    setHistoryError('')
    resetPendingLoginChallenge()
    navigate('home')
    if (clearUi) {
      setError('')
      setAuthError('')
    }
  }

  const avatarInitial = (auth.username || '?').slice(0, 1).toUpperCase()
  const routeTask = route.taskId === null ? null : tasks.find((task) => task.id === route.taskId)
  const currentPageLabel =
    route.page === 'create'
      ? 'Nouvelle tâche'
      : route.page === 'edit'
        ? `Modifier #${route.taskId ?? ''}`
        : route.page === 'history'
          ? `Historique #${route.taskId ?? ''}`
          : 'Accueil'

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="page-title-block">
          <h1>Task Manager UI</h1>
        </div>
        <div className="header-actions">
          {auth.token ? (
            <>
              <div className="user-badge">
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
                  {auth.username} ({auth.role})
                </span>
              </div>
              <button className="cancel-btn" onClick={() => logout()}>
                Se déconnecter
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!auth.token && (
        <section className="form-panel">
          <h2>{authMode === 'login' ? 'Connexion' : 'Inscription'}</h2>
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
                  setAuthMode(authMode === 'login' ? 'register' : 'login')
                }}
              >
                {authMode === 'login' ? 'Créer un compte' : "J'ai déjà un compte"}
              </button>
            </form>
          )}
          {authError && <p className="error-text">{authError}</p>}
        </section>
      )}

      {auth.token && (
        <>
          <nav className="breadcrumb" aria-label="Fil d'ariane">
            <button
              className="breadcrumb-link"
              type="button"
              onClick={() => navigate('home')}
              disabled={route.page === 'home'}
            >
              Accueil
            </button>
            {route.page !== 'home' && (
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
                  {historyEntries.map((entry) => (
                    <article className="history-item" key={entry.id}>
                      <div className="history-head">
                        <strong>{entry.action}</strong>
                        <span>{entry.changedAt ? String(entry.changedAt).replace('T', ' ') : '-'}</span>
                      </div>
                      <p>
                        <strong>Titre:</strong> {entry.title}
                      </p>
                      <p>
                        <strong>Description:</strong> {entry.description}
                      </p>
                      <p>
                        <strong>Priorité:</strong> {entry.priority} | <strong>État:</strong>{' '}
                        {entry.completed ? 'Terminée' : 'En cours'}
                      </p>
                      <p>
                        <strong>Mode:</strong> {getDeadlineModeLabel(entry.category, entry.deadline)} |{' '}
                        <strong>Deadline:</strong> {entry.deadline || '-'} | <strong>Matière:</strong>{' '}
                        {entry.subjectName || '-'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}

export default App
