// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

// Import das páginas
import Home from './pages/Home'
import Obras from './pages/Obras'
import PrazosSAP from './pages/PrazosSAP'
import Programacao from './pages/Programacao'
import Faturamento from './pages/Faturamento'
import ParetoObras from './pages/ParetoObras'
import ParetoManutencao from './pages/ParetoManutencao'
import GAQLP from './pages/GAQLP'
import KPIManutencao from './pages/KPIManutencao'
import CarteiraObras from './pages/CarteiraObras'
import PrioridadeObras from './pages/PrioridadeObras'
import Mapa from './pages/Mapa'
import DefeitosProgeo from './pages/DefeitosProgeo'
import Login from './pages/Login'

function App() {
  const [logado, setLogado] = useState<boolean>(() => {
    return localStorage.getItem('logado') === 'true'
  })

  const navigate = useNavigate()

  const handleLogin = () => {
    setLogado(true)
    localStorage.setItem('logado', 'true')
    localStorage.setItem('ultimoAcesso', String(Date.now()))
    navigate('/home')
  }

  const logout = () => {
    setLogado(false)
    localStorage.removeItem('logado')
    localStorage.removeItem('ultimoAcesso')
    navigate('/login')
  }

  // Redireciona se não estiver logado
  useEffect(() => {
    if (!logado) {
      navigate('/login')
    }
  }, [logado, navigate])

  // Verifica expiração da sessão a cada 30s
  useEffect(() => {
    const intervalo = setInterval(() => {
      const ultimo = Number(localStorage.getItem('ultimoAcesso'))
      if (logado && ultimo && Date.now() - ultimo > 10 * 60 * 1000) {
        logout()
      }
    }, 30 * 1000) // Verifica a cada 30 segundos

    return () => clearInterval(intervalo)
  }, [logado])

  // Atualiza tempo de sessão em qualquer atividade do usuário
  useEffect(() => {
    const atualizarAcesso = () => {
      if (logado) {
        localStorage.setItem('ultimoAcesso', String(Date.now()))
      }
    }

    window.addEventListener('mousemove', atualizarAcesso)
    window.addEventListener('keydown', atualizarAcesso)
    window.addEventListener('click', atualizarAcesso)
    window.addEventListener('scroll', atualizarAcesso)

    return () => {
      window.removeEventListener('mousemove', atualizarAcesso)
      window.removeEventListener('keydown', atualizarAcesso)
      window.removeEventListener('click', atualizarAcesso)
      window.removeEventListener('scroll', atualizarAcesso)
    }
  }, [logado])

  return (
    <Routes>
      {/* Página de login */}
      <Route path="/login" element={<Login onLogin={handleLogin} />} />

      {/* Redirecionamento raiz conforme login */}
      <Route path="/" element={<Navigate to={logado ? "/home" : "/login"} replace />} />

      {/* Páginas internas protegidas */}
      {logado ? (
        <>
          <Route path="/home" element={<Home />} />
          <Route path="/obras" element={<Obras />} />
          <Route path="/prazos-sap" element={<PrazosSAP />} />
          <Route path="/programacao" element={<Programacao />} />
          <Route path="/faturamento" element={<Faturamento />} />
          <Route path="/pareto-obras" element={<ParetoObras />} />
          <Route path="/pareto-manutencao" element={<ParetoManutencao />} />
          <Route path="/ga-qlp" element={<GAQLP />} />
          <Route path="/kpi-manutencao" element={<KPIManutencao />} />
          <Route path="/carteira-obras" element={<CarteiraObras />} />
          <Route path="/prioridade-obras" element={<PrioridadeObras />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/defeitos-progeo" element={<DefeitosProgeo />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  )
}

export default function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  )
}
