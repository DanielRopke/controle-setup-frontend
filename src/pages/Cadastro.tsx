import { useState } from 'react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import logoCadastro from '../assets/LogoSetup1.png'
import { FundoAnimado } from '../components/FundoAnimado'

export default function Cadastro() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [matricula, setMatricula] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrim = email.trim()
    if (!emailTrim) {
      toast.error('Informe o e-mail empresarial')
      return
    }
    // Validação simples de e-mail
    const emailOk = /.+@.+\..+/.test(emailTrim)
    if (!emailOk) {
      toast.error('E-mail inválido')
      return
    }
    if (!matricula.trim()) {
      toast.error('Informe a matrícula')
      return
    }
    if (!password) {
      toast.error('Informe a senha')
      return
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não conferem')
      return
    }
    toast.info('Cadastro: integração com backend a definir')
  }

  return (
  <div className="relative min-h-screen p-4 bg-transparent">
  {/* Fundo animado atrás do conteúdo (sem badge) */}
  <FundoAnimado showBadge={false} zIndex={0} />
      {/* Imagem centralizada na segunda coluna imaginária (37.5%) */}
      <img
        src={logoCadastro}
        alt="Logo Setup"
        className="absolute top-1/2 left-1/2 md:left-[37.5%] -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-[90vw] h-auto select-none pointer-events-none z-0"
      />
      <div
        className="absolute top-1/2 left-1/2 md:left-[75%] -translate-x-1/2 -translate-y-1/2 w-full max-w-sm p-6 space-y-4 bg-white shadow rounded-xl z-20"
      >
  <h1 className="text-lg font-semibold text-gray-800">Novo Cadastro</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-700">E-mail Empresarial</label>
            <input
              type="email"
              className="w-full px-3 py-2 border rounded"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              placeholder="seu.nome@gruposetup.com.br"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">Matrícula</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={matricula}
              onChange={(e)=>setMatricula(e.target.value)}
              placeholder="Sua matrícula"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">Usuário</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={username}
              onChange={(e)=>setUsername(e.target.value)}
              placeholder="Seu usuário"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">Senha</label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              placeholder="Sua senha"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">Confirmar Senha</label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded"
              value={confirmPassword}
              onChange={(e)=>setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              required
            />
          </div>
          <button type="submit" className="w-full py-2 text-white rounded bg-emerald-600">Cadastrar</button>
        </form>
  <Link to="/login" className="block text-sm text-center text-emerald-700 hover:underline">Voltar ao Login</Link>
      </div>
    </div>
  )
}
