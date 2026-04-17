import { useEffect, useState } from 'react'
import './App.css'

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
  }))
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    subjectName: '',
    category: 'WITHOUT_DEADLINE',
    deadline: '',
  })

  const API_URL = 'http://localhost:8080/api/tasks'
  const AUTH_URL = 'http://localhost:8080/api/auth'

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

  const fetchTasks = async () => {
    setLoading(true)
    setError('')

    if (!auth.token) {
      setTasks([])
      setLoading(false)
      return
    }

    try {
      const response = await fetch(API_URL, {
        headers: authHeaders(),
      })
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
        setError('Session expiree. Reconnecte-toi.')
        return
      }
      setError('Impossible de charger les taches depuis le backend Java.')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [auth.token])

  const resetForm = () => {
    setEditingTaskId(null)
    setForm({
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
      title: form.title,
      description: form.description,
      priority: form.priority,
      subjectName: form.subjectName.trim() === '' ? null : form.subjectName.trim(),
      category: form.category,
      deadline:
        form.category === 'WITH_DEADLINE' && form.deadline.trim() !== '' ? form.deadline : null,
    }

    try {
      const isEdit = editingTaskId !== null
      const response = await fetch(isEdit ? `${API_URL}/${editingTaskId}` : API_URL, {
        method: isEdit ? 'PUT' : 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          ...payload,
          completed:
            editingTaskId === null
              ? false
              : tasks.find((task) => task.id === editingTaskId)?.completed ?? false,
        }),
      })

      if (!response.ok) {
        throw new Error('Create failed')
      }

      resetForm()
      await fetchTasks()
    } catch (err) {
      setError(editingTaskId === null ? 'Impossible de creer la tache.' : 'Impossible de modifier la tache.')
    }
  }

  const startEditTask = (task) => {
    setEditingTaskId(task.id)
    setForm({
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
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    } catch (err) {
      setError('Impossible de terminer la tache.')
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
    } catch (err) {
      setError('Impossible de supprimer la tache.')
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

  const filteredTasks = tasks.filter((task) => {
    const needle = searchTerm.trim().toLowerCase()
    if (needle === '') return true

    const haystack = [
      String(task.id ?? ''),
      task.title ?? '',
      task.description ?? '',
      task.subjectName ?? '',
      task.priority ?? '',
      task.category ?? '',
      task.type ?? '',
      task.completed ? 'terminee' : 'en cours',
      task.deadline ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(needle)
  })

  const handleAuth = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      const endpoint = authMode === 'login' ? 'login' : 'register'
      const response = await fetch(`${AUTH_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authForm.username.trim(),
          password: authForm.password,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Identifiants invalides.')
        }
        if (response.status === 409) {
          throw new Error('Nom utilisateur deja pris.')
        }
        throw new Error('Echec authentification.')
      }

      const data = await response.json()
      const nextAuth = {
        token: data.token || '',
        username: data.username || authForm.username.trim(),
        role: data.role || 'USER',
      }

      localStorage.setItem('tm_token', nextAuth.token)
      localStorage.setItem('tm_username', nextAuth.username)
      localStorage.setItem('tm_role', nextAuth.role)
      setAuth(nextAuth)
      setAuthForm({ username: '', password: '' })
    } catch (err) {
      setAuthError(err.message || 'Erreur authentification.')
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = (clearUi = true) => {
    localStorage.removeItem('tm_token')
    localStorage.removeItem('tm_username')
    localStorage.removeItem('tm_role')
    setAuth({ token: '', username: '', role: 'USER' })
    setTasks([])
    if (clearUi) {
      setError('')
      setAuthError('')
    }
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <h1>Task Manager UI</h1>
          <p>
            {auth.token
              ? `Connecte en tant que ${auth.username} (${auth.role})`
              : 'Connecte-toi pour acceder a tes taches'}
          </p>
        </div>
        <div>
          {auth.token ? (
            <>
              <button className="refresh-btn" onClick={fetchTasks}>
                Actualiser
              </button>
              <button className="cancel-btn" onClick={() => logout()}>
                Se deconnecter
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!auth.token && (
        <section className="form-panel">
          <h2>{authMode === 'login' ? 'Connexion' : 'Inscription'}</h2>
          <form className="task-form" onSubmit={handleAuth}>
            <input
              placeholder="Nom utilisateur"
              value={authForm.username}
              onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
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
                setAuthMode(authMode === 'login' ? 'register' : 'login')
              }}
            >
              {authMode === 'login' ? 'Creer un compte' : 'Jai deja un compte'}
            </button>
          </form>
          {authError && <p className="error-text">{authError}</p>}
        </section>
      )}

      {auth.token && (
        <>

          <section className="status-panel">
            {loading && <p>Chargement des taches...</p>}
            {!loading && error && <p className="error-text">{error}</p>}
            {!loading && !error && (
              <p>
                {filteredTasks.length} / {tasks.length} tache(s) affichee(s)
              </p>
            )}
          </section>

          <section className="search-panel">
            <input
              className="search-input"
              type="text"
              placeholder="Rechercher une tache (titre, matiere, priorite, ID...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm.trim() !== '' && (
              <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                Effacer
              </button>
            )}
          </section>

          <section className="form-panel">
            <h2>{editingTaskId === null ? 'Nouvelle tache' : `Modifier la tache #${editingTaskId}`}</h2>
            <form className="task-form" onSubmit={createTask}>
              <input
                placeholder="Titre"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
              <input
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="WITHOUT_DEADLINE">Sans deadline</option>
                <option value="WITH_DEADLINE">Avec deadline</option>
              </select>
              <input
                placeholder="Matiere (optionnel)"
                value={form.subjectName}
                onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              />
              {form.category === 'WITH_DEADLINE' && (
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                />
              )}
              <button type="submit" className="create-btn">
                {editingTaskId === null ? 'Creer' : 'Enregistrer'}
              </button>
              {editingTaskId !== null && (
                <button type="button" className="cancel-btn" onClick={resetForm}>
                  Annuler
                </button>
              )}
            </form>
          </section>

          <section className="task-grid">
            {!loading && !error && filteredTasks.length === 0 && (
              <article className="task-card empty">
                {searchTerm.trim() === ''
                  ? 'Aucune tache trouvee.'
                  : 'Aucun resultat pour cette recherche.'}
              </article>
            )}

            {!loading &&
              !error &&
              filteredTasks.map((task) => (
                <article className="task-card" key={task.id}>
                  <div className="card-header">
                    <h2>{task.title}</h2>
                    <span className={'priority-badge ' + getPriorityClass(task.priority)}>
                      {task.priority || 'LOW'}
                    </span>
                  </div>
                  <p className="description">{task.description}</p>
                  <dl>
                    <div>
                      <dt>ID</dt>
                      <dd>{task.id}</dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd>{getDeadlineModeLabel(task.category ?? task.type, task.deadline)}</dd>
                    </div>
                    <div>
                      <dt>Etat</dt>
                      <dd>{task.completed ? 'Terminee' : 'En cours'}</dd>
                    </div>
                    <div>
                      <dt>Matiere</dt>
                      <dd>{task.subjectName || '-'}</dd>
                    </div>
                    <div>
                      <dt>Deadline</dt>
                      <dd>{task.deadline || '-'}</dd>
                    </div>
                  </dl>
                  <div className="card-actions">
                    <button className="edit-btn" onClick={() => startEditTask(task)}>
                      Modifier
                    </button>
                    {!task.completed && (
                      <button className="done-btn" onClick={() => completeTask(task.id)}>
                        Terminer
                      </button>
                    )}
                    <button className="delete-btn" onClick={() => deleteTask(task.id)}>
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
          </section>
        </>
      )}
    </main>
  )
}

export default App
