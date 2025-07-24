// src/pages/PrazosSAP.tsx
// import React from 'react' // removido, não utilizado
// @ts-ignore
import html2canvas from 'html2canvas';
import { FundoAnimado } from '../components/FundoAnimado'
import { useNavigate } from 'react-router-dom'
import { SidebarFiltros } from '../components/SidebarFiltros'
import { GraficoBarras } from '../components/GraficoBarras'
import { TabelaMatriz } from '../components/TabelaMatriz'
import { useFiltros } from '../hooks/useFiltros'
import { useDadosGraficos } from '../hooks/useDadosGraficos'
import { processarDados } from '../utils/processarDados'
import logo from '../assets/logo.png'
import filtroLimpo from '../assets/filtro-limpo.png'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList
} from 'recharts'

export default function PrazosSAP() {
  const navigate = useNavigate()
  const {
    seccionaisSelecionadas,
    toggleSeccional,
    statusSap,
    setStatusSap,
    tipo,
    setTipo,
    mes,
    setMes
  } = useFiltros()

  const {
    seccionais,
    statusSapList,
    tiposList,
    mesesList,
    graficoEner,
    graficoConc,
    graficoServico,
    graficoSeccionalRS,
    matriz
  } = useDadosGraficos({ seccionais: seccionaisSelecionadas, statusSap, tipo, mes })




  // Ordenação decrescente garantida
  const dadosEner = processarDados(graficoEner, false, { seccionais: seccionaisSelecionadas })
    .slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const dadosConc = processarDados(graficoConc, true, { seccionais: seccionaisSelecionadas })
    .slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  // Motivo de Não Fechado: agrupa por status, somando todas as seccionais selecionadas
  const dadosServico = Array.isArray(graficoServico)
    ? graficoServico
        .filter(item => !seccionaisSelecionadas.length || seccionaisSelecionadas.includes(item.seccional))
        .reduce((acc, item) => {
          const found = acc.find(d => d.status === item.status);
          if (found) {
            found.count += item.count;
          } else {
            acc.push({ status: item.status, count: item.count });
          }
          return acc;
        }, [] as { status: string; count: number }[])
        .slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    : [];
  // Filtra os dados conforme os filtros aplicados
  const graficoSeccionalRSFiltrado = Array.isArray(graficoSeccionalRS)
    ? graficoSeccionalRS.filter(item => {
        const seccionalMatch = !seccionaisSelecionadas.length || seccionaisSelecionadas.includes(item.seccional);
        const statusMatch = !statusSap || item.statusSap === statusSap;
        const tipoMatch = !tipo || item.tipo === tipo;
        const mesMatch = !mes || item.mes === mes;
        return seccionalMatch && statusMatch && tipoMatch && mesMatch;
      })
    : [];
  const graficoSeccionalRSOrdenado = Array.isArray(graficoSeccionalRSFiltrado)
    ? graficoSeccionalRSFiltrado.slice().sort((a, b) => (b.totalRS ?? 0) - (a.totalRS ?? 0))
    : [];

  // Função para tratar clique nas barras dos gráficos
  const handleBarClick = (item: { status?: string, count?: number }, tipoGrafico: string) => {
    if (!item) return;
    if (tipoGrafico === 'ener' && item.status) {
      setStatusSap(item.status);
    }
    if (tipoGrafico === 'conc' && item.status) {
      setTipo(item.status);
    }
    // Adapte para outros gráficos conforme necessário
  };



  const formatarValorRS = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          right: 16,
          zIndex: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          clipPath: 'inset(0px 16px 0px 0px)'
        }}
      >
        <FundoAnimado />
      </div>
      <div className="flex flex-col min-h-screen bg-gray-900 scrollbar-prazossap" style={{ position: 'relative', overflow: 'auto' }}>
        <style>{`
          .scrollbar-prazossap::-webkit-scrollbar {
            width: 12px;
            background: #4ade80;
          }
          .scrollbar-prazossap::-webkit-scrollbar-thumb {
            background: #a3a3a3;
            border-radius: 8px;
          }
          .scrollbar-prazossap {
            scrollbar-width: thin;
            scrollbar-color: #a3a3a3 #4ade80;
          }
        `}</style>
        <header
          className="fixed top-0 left-0 z-[100] flex items-center px-6 shadow-md"
          style={{
            background: 'linear-gradient(135deg, rgba(74,222,128,0.85) 0%, rgba(34,197,94,0.85) 100%)',
            height: '72px',
            width: 'calc(100% - 16px)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)'
          }}
        >
          <button
            onClick={() => navigate('/obras')}
            className="botao-home ml-[12px] rounded-full bg-gray-800 shadow-3d flex items-center justify-center"
            title="Voltar para menu"
            aria-label="Voltar para menu"
            type="button"
            style={{ width: 160, height: 48, padding: 0 }}
          >
            <img src={logo} alt="Logo Empresa" className="logo-botao" />
          </button>
          <button
            onClick={() => {
              setStatusSap('');
              setTipo('');
              setMes('');
              seccionaisSelecionadas.forEach(s => toggleSeccional(s));
            }}
            className="botao-home ml-[12px] rounded-full bg-gray-800 shadow flex items-center justify-center"
            title="Limpar todos os filtros"
            aria-label="Limpar todos os filtros"
            type="button"
            style={{ width: 48, height: 48, padding: 0, minWidth: 48, minHeight: 48, borderRadius: '50%', marginLeft: 28 }}
          >
            <img src={filtroLimpo} alt="Limpar filtros" style={{ width: 28, height: 28 }} />
          </button>
          <div
            className="ml-[12px] rounded-full bg-gray-800 border-2 border-gray-700 shadow-3d flex flex-col items-center justify-center font-bold text-gray-100 text-lg"
            style={{ width: 160, height: 48, backgroundColor: '#fff' }}
          >
            <span>Valor Total</span>
            <span className="text-base font-semibold text-green-700" style={{ fontWeight: 600 }}>
              {formatarValorRS(
                Array.isArray(graficoSeccionalRSOrdenado)
                  ? graficoSeccionalRSOrdenado.reduce((acc, cur) => acc + (cur.totalRS || 0), 0)
                  : 0
              )}
            </span>
          </div>
          <h1 className="flex-grow font-serif text-2xl font-bold text-center text-white">
            Prazos SAP
          </h1>
          <div style={{ minWidth: 0, flex: '0 0 384px', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginRight: '16px' }}>
            <div
              className="flex flex-col items-center justify-center text-lg font-bold text-gray-100 bg-gray-800 border-2 border-gray-700 rounded-full shadow-3d"
              style={{ width: 160, height: 48, backgroundColor: '#fff' }}
            >
              <span>Valor Total</span>
              <span className="text-base font-semibold text-green-700" style={{ fontWeight: 600 }}>
                {formatarValorRS(
                  Array.isArray(graficoSeccionalRSOrdenado)
                    ? graficoSeccionalRSOrdenado.reduce((acc, cur) => acc + (cur.totalRS || 0), 0)
                    : 0
                )}
              </span>
            </div>
            <div
              className="flex flex-col items-center justify-center text-lg font-bold text-gray-100 bg-gray-800 border-2 border-gray-700 rounded-full shadow-3d"
              style={{ width: 160, height: 48, backgroundColor: '#fff' }}
            >
              <span>Qtd de PEP</span>
              <span className="text-base font-semibold text-green-700" style={{ fontWeight: 600 }}>
                {Array.isArray(graficoSeccionalRSOrdenado)
                  ? graficoSeccionalRSOrdenado.reduce((acc, cur) => acc + (cur.totalPEP || 0), 0)
                  : 0}
              </span>
            </div>
          </div>
        </header>
        <div style={{ height: '88px' }} />
        <div className="flex flex-1 gap-8 p-6">
          {/* Sidebar fixo */}
          <div
            style={{
              position: 'fixed',
              top: 88,
              left: 0,
              zIndex: 50,
              width: 185,
              height: 'calc(100vh - 88px - 16px)', // 16px de espaçamento inferior
              minHeight: 400,
              marginBottom: 0,
              display: 'flex',
              flexDirection: 'column',
              background: 'linear-gradient(135deg, rgba(74,222,128,0.85) 0%, rgba(34,197,94,0.85) 100%)',
              borderTopRightRadius: '1.5rem',
              borderBottomRightRadius: '1.5rem',
              overflow: 'hidden',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          >
            <SidebarFiltros
              seccionais={seccionais}
              seccionaisSelecionadas={seccionaisSelecionadas}
              toggleSeccional={toggleSeccional}
              statusSapList={statusSapList}
              tiposList={tiposList}
              mesesList={mesesList}
              statusSap={statusSap}
              tipo={tipo}
              mes={mes}
              setStatusSap={setStatusSap}
              setTipo={setTipo}
              setMes={setMes}
              className="shadow-3d p-0 h-full min-h-[400px] flex-1"
            />
            <div style={{ height: '16px' }} />
          </div>
          {/* Espaço para o conteúdo não ficar atrás do sidebar */}
          <div style={{ width: 201 }} />
          <div className="flex flex-col flex-1 gap-8">
            <div className="flex gap-8">
              <div className="flex flex-col flex-1 gap-8">
                <div className="z-[10]">
                  <GraficoBarras
                    titulo="Status ENER"
                    dados={dadosEner}
                    onBarClick={item => handleBarClick(item, 'ener')}
                  />
                </div>
                <div style={{ height: '16px' }} />
                <div className="z-[10]">
                  <GraficoBarras
                    titulo="Status CONC"
                    dados={dadosConc}
                    onBarClick={item => handleBarClick(item, 'conc')}
                  />
                </div>
              </div>
              <div style={{ width: '16px' }} />
              <div className="flex flex-col flex-1 gap-8">
                <div className="p-6 rounded-3xl shadow-lg h-[280px] flex flex-col z-[10] relative" style={{background: 'linear-gradient(135deg, #bbf7d0 0%, #a7f3d0 100%)', borderRadius: '1.5rem', marginRight: '16px'}}>
                  <button
                    title="Copiar imagem do gráfico"
                    onClick={async e => {
                      e.stopPropagation();
                      const graficoDiv = e.currentTarget.parentElement;
                      if (!graficoDiv) return;
                      const html2canvas = (await import('html2canvas')).default;
                  html2canvas(graficoDiv, {}).then((canvas: HTMLCanvasElement) => {
                    canvas.toBlob((blob: Blob | null) => {
                      if (blob) {
                        const item = new ClipboardItem({ 'image/png': blob });
                        navigator.clipboard.write([item]);
                      }
                    });
                  });
                    }}
                    style={{ position: 'absolute', top: 12, right: 12, zIndex: 20, width: 32, height: 32, background: '#fff', borderRadius: 8, border: '2px solid #4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  >
                    {/* Ícone clássico de copiar (duas folhas) */}
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="6" y="6" width="9" height="12" rx="2" fill="#bbf7d0" stroke="#22c55e" strokeWidth="1.5" />
                      <rect x="3" y="3" width="9" height="12" rx="2" fill="#fff" stroke="#22c55e" strokeWidth="1.2" />
                    </svg>
                  </button>
                  <h2 className="text-center font-semibold mb-4 font-serif text-gray-700 text-[20px]">
                    Valor x Qtd PEP Por Seccional
                  </h2>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={graficoSeccionalRSOrdenado} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}
                        onClick={e => {
                      if (e && 'activePayload' in e && Array.isArray(e.activePayload) && e.activePayload[0]) {
                        handleBarClick(e.activePayload[0].payload, 'seccional');
                      }
                        }}
                      >
                      <foreignObject x={0} y={0} width="100%" height="100%">
                        <div style={{width: '100%', height: '100%', background: 'rgba(255,255,255,0.9)', borderRadius: 20, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(16px)'}} />
                      </foreignObject>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="seccional" tick={{ fill: '#4a4a4a' }} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === 'totalRS' ? formatarValorRS(value) : value,
                          name === 'totalRS' ? 'R$' : 'PEP',
                        ]}
                      />
                      <Bar dataKey="totalRS" fill="#3182ce">
                        <LabelList
                          dataKey="totalRS"
                          position="top"
                          fill="#333"
                          fontSize={12}
                        />
                      </Bar>
                      <Bar dataKey="scaledPEP" fill="#4ade80">
                        <LabelList dataKey="totalPEP" position="top" fill="#333" fontSize={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ height: '16px' }} />
                <div style={{ marginRight: '16px' }}>
                  <div className="relative z-[20]">
                    <div className="absolute top-0 left-0 w-full h-[48px] rounded-t-3xl bg-white/90 backdrop-blur-md z-[30] pointer-events-none" />
                    <div className="relative z-[40]">
                      <GraficoBarras
                        titulo="Motivo de Não Fechado"
                        dados={dadosServico}
                        onBarClick={item => handleBarClick(item, 'servico')}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: 'relative', zIndex: 40, marginRight: '16px' }}>
              <TabelaMatriz dados={matriz} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
