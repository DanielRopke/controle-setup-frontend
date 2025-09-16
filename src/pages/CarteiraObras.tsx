/* eslint-disable @typescript-eslint/no-explicit-any */
import { useNavigate } from 'react-router-dom'
import { SidebarFiltros } from '../components/SidebarFiltros'
import { TabelaMatriz } from '../components/TabelaMatriz'
import { useFiltros } from '../hooks/useFiltros'
import { useDadosGraficos } from '../hooks/useDadosGraficos'
import useGoogleSheetCarteira from '../hooks/useGoogleSheetCarteira'
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
  LabelList,
  Cell
} from 'recharts'
import { useState, useMemo } from 'react';


export default function CarteiraObras() {
  const navigate = useNavigate();
  const {
    seccionaisSelecionadas,
    toggleSeccional,
    statusSap,
    setStatusSap,
    tipo,
    setTipo,
    mes,
    setMes
  } = useFiltros();
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
  // Tipagem local simplificada: os hooks retornam objetos cujo shape é complexo;
  // aqui usamos any[] para evitar erros TS por ora (manter compatibilidade com PrazosSAP).
  } = useDadosGraficos({ seccionais: seccionaisSelecionadas, statusSap, tipo, mes }) as any;
  // Hook alternativo: carregar dados diretamente do Google Sheets (aba CarteiraObras)
  const sheetId = '1wj3AZ5__Ak8THPHu-Lr1iGU-7l9fX8sf6MVY-kBMFhI'
  const googleData = useGoogleSheetCarteira(sheetId, 'CarteiraObras') as any
  // preferir dados do google quando disponíveis
  const graficoEnerSrc = (googleData && googleData.graficoEner && Object.keys(googleData.graficoEner).length) ? googleData.graficoEner : graficoEner
  const graficoConcSrc = (googleData && googleData.graficoConc && Object.keys(googleData.graficoConc).length) ? googleData.graficoConc : graficoConc
  const graficoServicoSrc = (googleData && googleData.graficoServico && Object.keys(googleData.graficoServico).length) ? googleData.graficoServico : graficoServico
  const graficoSeccionalRSSrc = (googleData && googleData.graficoSeccionalRS && Object.keys(googleData.graficoSeccionalRS).length) ? googleData.graficoSeccionalRS : graficoSeccionalRS
  const matrizSrc = (googleData && Array.isArray(googleData.matriz) && googleData.matriz.length) ? googleData.matriz : matriz
  // NOTE: useDadosGraficos returns complex shapes; we'll normalize arrays inside useMemo

  const [activeFilters, setActiveFilters] = useState<{
    statusENER?: string;
    statusCONC?: string;
    comparison?: string;
    reasons?: string;
  }>({});

  function handleChartClick(
    chartType: 'statusENER'|'statusCONC'|'comparison'|'reasons',
    dataPoint: unknown
  ) {
    const dp = (dataPoint && typeof dataPoint === 'object') ? dataPoint as Record<string, unknown> : {};
    const payload = (dp['payload'] && typeof dp['payload'] === 'object') ? (dp['payload'] as Record<string, unknown>) : dp;
    const value = chartType === 'comparison'
      ? String((payload as Record<string, any>)?.seccional ?? '')
      : String(((payload as Record<string, any>)?.status ?? (payload as Record<string, any>)?.name) ?? '');
    if (!value) return;
    setActiveFilters(prev => ({
      ...prev,
      [chartType]: prev[chartType] === value ? undefined : value
    }));
  }

  const {
    dadosEner,
    dadosConc,
    dadosServico,
    graficoSeccionalRSOrdenado,
    matrizFiltrada
  } = useMemo(() => {
    const graficoEnerArr: any[] = (graficoEnerSrc as any) || [];
    const graficoConcArr: any[] = (graficoConcSrc as any) || [];
    const graficoServicoArr: any[] = (graficoServicoSrc as any) || [];
    const graficoSeccionalRSArr: any[] = (graficoSeccionalRSSrc as any) || [];
    const matrizArr: any[] = (matrizSrc as any) || [];

    const allSeccsSet = new Set<string>(
      (Array.isArray(graficoSeccionalRSArr) ? graficoSeccionalRSArr : []).map((g: any) => String(g.seccional))
    );
    const sets: Array<Set<string>> = [];
    if (activeFilters.comparison) sets.push(new Set([activeFilters.comparison]));
    if (activeFilters.statusENER) {
      const s = new Set<string>(
        graficoEnerArr.filter((i: any) => i.status === activeFilters.statusENER).map((i: any) => String(i.seccional))
      ); if (s.size) sets.push(s);
    }
    if (activeFilters.statusCONC) {
      const s = new Set<string>(
        graficoConcArr.filter((i: any) => i.status === activeFilters.statusCONC).map((i: any) => String(i.seccional))
      ); if (s.size) sets.push(s);
    }
    if (activeFilters.reasons) {
      const s = new Set<string>(
        graficoServicoArr.filter((i: any) => i.status === activeFilters.reasons).map((i: any) => String(i.seccional))
      ); if (s.size) sets.push(s);
    }
    let selectedSeccs: Set<string> = new Set(allSeccsSet);
    if (sets.length) selectedSeccs = new Set([...allSeccsSet].filter(s => sets.every(seti => seti.has(s))));
    const selectedSeccsArr = [...selectedSeccs];
    let dadosEner = processarDados(graficoEnerArr, false, { seccionais: selectedSeccsArr }).slice();
    let dadosConc = processarDados(graficoConcArr, true, { seccionais: selectedSeccsArr }).slice();
    let dadosServico = processarDados(graficoServicoArr, false, { seccionais: selectedSeccsArr }).slice();
    const graficoSeccionalRSOrdenado = (Array.isArray(graficoSeccionalRSArr) ? graficoSeccionalRSArr : [])
      .filter((item: any) => selectedSeccs.has(item.seccional))
      .slice()
      .sort((a, b) => (b.totalRS ?? 0) - (a.totalRS ?? 0));
  const matrizFiltrada = matrizArr.filter((item: any) => selectedSeccs.has(String(item.seccional)));
    dadosEner = dadosEner.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    dadosConc = dadosConc.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    dadosServico = dadosServico.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    return { dadosEner, dadosConc, dadosServico, graficoSeccionalRSOrdenado, matrizFiltrada };
  }, [graficoEnerSrc, graficoConcSrc, graficoServicoSrc, graficoSeccionalRSSrc, matrizSrc, activeFilters]);

  const formatarValorRS = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

  return (
    <div className="flex flex-col min-h-screen bg-gray-900" style={{ position: 'relative', zIndex: 0, overflow: 'auto' }}>
      <header
        className="w-full absolute top-0 left-0 z-[100] flex items-center px-6 shadow-md"
        style={{ backgroundColor: '#4ade80', height: '72px', width: '100%' }}
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
          onClick={() => { setStatusSap(''); setTipo(''); setMes(''); seccionaisSelecionadas.forEach(s => toggleSeccional(s)); }}
          className="botao-home ml-[12px] rounded-full bg-gray-800 shadow flex items-center justify-center"
          title="Limpar todos os filtros"
          aria-label="Limpar todos os filtros"
          type="button"
          style={{ width: 96, height: 48, padding: 0 }}
        >
          <img src={filtroLimpo} alt="Limpar filtros" style={{ width: 32, height: 32 }} />
        </button>
        <div
          className="ml-[12px] rounded-full bg-gray-800 border-2 border-gray-700 shadow-3d flex flex-col items-center justify-center font-bold text-gray-100 text-lg"
          style={{ width: 160, height: 48, backgroundColor: '#fff' }}
        >
          <span>Valor Total</span>
          <span className="text-base font-semibold text-green-700" style={{ fontWeight: 600 }}>
            {formatarValorRS(
              Array.isArray(graficoSeccionalRSSrc as any) ? (graficoSeccionalRSSrc as any).reduce((acc: number, cur: any) => acc + (cur.totalRS || 0), 0) : 0
            )}
          </span>
        </div>
        <h1 className="flex-grow font-serif text-2xl font-bold text-center text-white">
          Carteira de Obras
        </h1>
        <div style={{ minWidth: 0, flex: '0 0 384px', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginRight: '16px' }}>
          <div className="flex flex-col items-center justify-center text-lg font-bold text-gray-100 bg-gray-800 border-2 border-gray-700 rounded-full shadow-3d" style={{ width: 160, height: 48, backgroundColor: '#fff' }}>
            <span>Valor Total</span>
            <span className="text-base font-semibold text-green-700" style={{ fontWeight: 600 }}>
              {formatarValorRS(
                Array.isArray(graficoSeccionalRSSrc as any) ? (graficoSeccionalRSSrc as any).reduce((acc: number, cur: any) => acc + (cur.totalRS || 0), 0) : 0
              )}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center text-lg font-bold text-gray-100 bg-gray-800 border-2 border-gray-700 rounded-full shadow-3d" style={{ width: 160, height: 48, backgroundColor: '#fff' }}>
            <span>Qtd de PEP</span>
            <span className="text-base font-semibold text-green-700" style={{ fontWeight: 600 }}>
              {Array.isArray(graficoSeccionalRSSrc as any) ? (graficoSeccionalRSSrc as any).reduce((acc: number, cur: any) => acc + (cur.totalPEP || 0), 0) : 0}
            </span>
          </div>
        </div>
      </header>
      <div style={{ height: '88px' }} />
      <div className="flex flex-1 gap-8 p-6">
        <div style={{ minHeight: 'calc(100vh - 88px)', height: '100%', marginBottom: '16px' }} className="sticky top-[88px] self-start z-50 w-[185px] flex flex-col">
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
            className="shadow-3d p-0 bg-[#4ade80] h-full min-h-[400px] rounded-l-3xl rounded-r-3xl rounded-br-3xl flex-1"
          />
          <div style={{ height: '16px' }} />
        </div>
        <div style={{ width: '16px' }} />
        <div className="flex flex-col flex-1 gap-8">
          <div className="flex gap-8">
            <div className="flex flex-col flex-1 gap-8">
              <div className="z-[10]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosEner} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" tick={{ fill: '#4a4a4a' }} />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3182ce" onClick={data => handleChartClick('statusENER', data)}>
                      {dadosEner.map((entry, idx) => (
                        <Cell key={idx} fill={activeFilters.statusENER === entry.status ? '#ef4444' : '#3182ce'} />
                      ))}
                      <LabelList dataKey="count" position="top" fill="#333" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ height: '16px' }} />
              <div className="z-[10]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosConc} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" tick={{ fill: '#4a4a4a' }} />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" onClick={data => handleChartClick('statusCONC', data)}>
                      {dadosConc.map((entry, idx) => (
                        <Cell key={idx} fill={activeFilters.statusCONC === entry.status ? '#ef4444' : '#6366f1'} />
                      ))}
                      <LabelList dataKey="count" position="top" fill="#333" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ width: '16px' }} />
            <div className="flex flex-col flex-1 gap-8">
              <div className="p-6 rounded-3xl shadow-lg h-[280px] flex flex-col z-[10]" style={{background: 'linear-gradient(135deg, #bbf7d0 0%, #a7f3d0 100%)', borderRadius: '1.5rem', marginRight: '16px'}}>
                <h2 className="text-center font-semibold mb-4 font-serif text-gray-700 text-[20px]">
                  Comparativo por Seccional: R$ e Qtd PEP
                </h2>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graficoSeccionalRSOrdenado} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="seccional" tick={{ fill: '#4a4a4a' }} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value, name) => [
                        name === 'totalRS' ? formatarValorRS(Number(value)) : value,
                        name === 'totalRS' ? 'R$' : 'PEP',
                      ]}
                    />
                    <Bar dataKey="totalRS" fill="#3182ce" onClick={data => handleChartClick('comparison', data)}>
                      {graficoSeccionalRSOrdenado.map((entry, idx) => (
                        <Cell key={idx} fill={activeFilters.comparison === entry.seccional ? '#ef4444' : '#3182ce'} />
                      ))}
                      <LabelList dataKey="totalRS" position="top" fill="#333" fontSize={12} />
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
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dadosServico} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="status" tick={{ fill: '#4a4a4a' }} />
                        <YAxis hide />
                        <Tooltip />
                        <Bar dataKey="count" fill="#4ade80" onClick={data => handleChartClick('reasons', data)}>
                          {dadosServico.map((entry, idx) => (
                            <Cell key={idx} fill={activeFilters.reasons === entry.status ? '#ef4444' : '#4ade80'} />
                          ))}
                          <LabelList dataKey="count" position="top" fill="#333" fontSize={12} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 40, marginRight: '16px' }}>
            <div style={{ height: '16px' }} />
            <div
              className="absolute top-[48px] left-0 w-full h-[calc(100%-48px)] rounded-b-3xl z-[30] pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, #dbeafe 0%, #bae6fd 100%)'
              }}
            />
            <div
              className="absolute top-0 left-0 w-full flex items-center justify-center rounded-t-3xl z-[40]"
              style={{
                height: '60px',
                background: 'linear-gradient(135deg, #bbf7d0 0%, #a7f3d0 100%)',
                opacity: 0.95,
                boxSizing: 'border-box',
                pointerEvents: 'auto'
              }}
            />
            <div
              className="absolute top-0 left-0 w-full flex items-center justify-center rounded-t-3xl z-[50] pointer-events-none"
              style={{ height: '60px' }}
            >
              <h2 className="text-center font-semibold font-serif text-gray-700 text-[20px]" style={{ width: '100%' }}>
                Matriz de Carteira de Obras
              </h2>
            </div>
            <div className="relative z-[30]">
              <TabelaMatriz dados={matrizFiltrada} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
// duplicate minimal component removed — the real `CarteiraObras` is the default export above
