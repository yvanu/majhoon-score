import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, BarChart3, Check, Copy, Crown, Plus, RotateCcw, Trophy, X } from 'lucide-react'
import './styles.css'

type Player = { id: string; name: string; avatar_seed: number; seat: number; score: number }
type Hand = { id:string; sequence:number; wind:string; hand_number:number; result_type:string; winner_player_id?:string; loser_player_id?:string; note?:string }
type Match = { id:string; share_code:string; status:'active'|'finished'; current_wind:string; current_hand:number; players:Player[]; hands:Hand[] }
type Stats = { totalHands:number; players:Array<Player & {rank:number;wins:number;tsumo:number;deal_in:number;winRate:number;dealInRate:number;tsumoShare:number;max_gain:number;max_loss:number}> }

const animals = ['🐼','🐯','🦊','🐸','🐧','🐵','🦁','🐨','🐰','🐲','🦄','🐙']
const gradients = [
  'linear-gradient(135deg,#ffbc6e,#ff7c61)', 'linear-gradient(135deg,#6fd7c3,#3da48f)',
  'linear-gradient(135deg,#9e9cff,#6c63d9)', 'linear-gradient(135deg,#ffd96f,#f2a93b)',
  'linear-gradient(135deg,#7dc5ff,#438bd2)', 'linear-gradient(135deg,#ff9ec2,#e36192)'
]
const windName:Record<string,string> = { east:'东', south:'南', west:'西', north:'北' }
const typeName:Record<string,string> = { tsumo:'自摸', ron:'点炮', draw:'流局', custom:'自定义' }

async function api<T>(path:string, options:RequestInit = {}, token?:string):Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type':'application/json', ...(token ? {'x-admin-token':token}:{}), ...(options.headers||{}) }
  })
  const body = await response.json() as any
  if (!response.ok) throw new Error(body.error || '请求失败')
  return body
}

function Avatar({ player, large=false }:{player:Player;large?:boolean}) {
  const seed = Number(player.avatar_seed || 0)
  return <div className={`avatar ${large?'avatar-large':''}`} style={{background:gradients[seed % gradients.length]}}>{animals[seed % animals.length]}</div>
}

function App() {
  const [match, setMatch] = useState<Match|null>(null)
  const [token, setToken] = useState('')
  const [screen, setScreen] = useState<'home'|'create'|'match'|'stats'>('home')
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stats|null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('mahjong-current')
    if (!saved) return
    try {
      const value = JSON.parse(saved)
      api<{match:Match}>(`/api/matches/${value.id}`).then(({match}) => {
        setMatch(match); setToken(value.token || ''); setScreen(match.status === 'finished' ? 'stats' : 'match')
        if (match.status === 'finished') loadStats(match.id)
      }).catch(() => localStorage.removeItem('mahjong-current'))
    } catch { localStorage.removeItem('mahjong-current') }
  }, [])

  async function loadStats(id:string) {
    const value = await api<Stats>(`/api/matches/${id}/statistics`)
    setStats(value)
  }

  async function create(names:string[]) {
    setLoading(true); setError('')
    try {
      const data = await api<{match:Match;adminToken:string}>('/api/matches', {method:'POST', body:JSON.stringify({players:names})})
      setMatch(data.match); setToken(data.adminToken); setScreen('match')
      localStorage.setItem('mahjong-current', JSON.stringify({id:data.match.id, token:data.adminToken}))
    } catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  async function submitHand(input:any) {
    if (!match) return
    setLoading(true); setError('')
    try {
      const data = await api<{match:Match}>(`/api/matches/${match.id}/hands`, {method:'POST', body:JSON.stringify(input)}, token)
      setMatch(data.match); setModal(false)
    } catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  async function undo() {
    if (!match || !confirm('撤销上一局计分？')) return
    setLoading(true)
    try {
      const data = await api<{match:Match}>(`/api/matches/${match.id}/hands/last`, {method:'DELETE'}, token)
      setMatch(data.match)
    } catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  async function finish() {
    if (!match || !confirm('确定结束本将？结束后不能继续录分。')) return
    setLoading(true)
    try {
      const data = await api<{match:Match}>(`/api/matches/${match.id}/finish`, {method:'POST'}, token)
      setMatch(data.match); await loadStats(match.id); setScreen('stats')
    } catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  function reset() {
    localStorage.removeItem('mahjong-current'); setMatch(null); setStats(null); setToken(''); setScreen('home')
  }

  return <div className="app-shell">
    {error && <div className="toast" onClick={()=>setError('')}><span>{error}</span><X size={18}/></div>}
    {screen === 'home' && <Home onStart={()=>setScreen('create')} />}
    {screen === 'create' && <Create onBack={()=>setScreen('home')} onCreate={create} loading={loading}/>} 
    {screen === 'match' && match && <MatchScreen match={match} onAdd={()=>setModal(true)} onUndo={undo} onFinish={finish} loading={loading}/>} 
    {screen === 'stats' && match && stats && <StatsScreen match={match} stats={stats} onReset={reset}/>} 
    {modal && match && <ScoreModal players={match.players} onClose={()=>setModal(false)} onSubmit={submitHand} loading={loading}/>} 
  </div>
}

function Home({onStart}:{onStart:()=>void}) {
  return <main className="home page">
    <section className="hero-card">
      <div className="brand-mark">雀</div>
      <div><p className="eyebrow">MAHJONG SCORE</p><h1>雀记</h1><p>四人麻将，轻松记分。</p></div>
    </section>
    <div className="tile-row"><span>🀀</span><span>🀄</span><span>🀅</span><span>🀆</span></div>
    <button className="primary giant" onClick={onStart}><Plus size={22}/> 开启一将</button>
    <section className="feature-grid">
      <div><b>4 圈</b><span>完整一将</span></div><div><b>秒记</b><span>自摸点炮</span></div><div><b>统计</b><span>排名胜率</span></div>
    </section>
    <p className="footnote">数据保存在 Cloudflare D1 · 无需注册</p>
  </main>
}

function Create({onBack,onCreate,loading}:{onBack:()=>void;onCreate:(n:string[])=>void;loading:boolean}) {
  const [names,setNames] = useState(['','','',''])
  const can = names.every(n=>n.trim()) && new Set(names.map(n=>n.trim())).size === 4
  return <main className="page">
    <header className="topbar"><button className="icon-btn" onClick={onBack}><ArrowLeft/></button><div><p className="eyebrow">NEW MATCH</p><h2>谁来上桌？</h2></div></header>
    <p className="muted">录入四位玩家姓名，系统会自动生成头像。</p>
    <section className="name-list">
      {names.map((name,i)=><label className="name-input" key={i}>
        <div className="avatar" style={{background:gradients[i]}}>{animals[i]}</div>
        <div><span>{['东家','南家','西家','北家'][i]}</span><input value={name} maxLength={12} placeholder={`玩家 ${i+1}`} onChange={e=>setNames(names.map((v,j)=>j===i?e.target.value:v))}/></div>
      </label>)}
    </section>
    <button className="primary giant bottom-action" disabled={!can||loading} onClick={()=>onCreate(names.map(n=>n.trim()))}>{loading?'创建中…':'开始计分'} <Check size={20}/></button>
  </main>
}

function MatchScreen({match,onAdd,onUndo,onFinish,loading}:{match:Match;onAdd:()=>void;onUndo:()=>void;onFinish:()=>void;loading:boolean}) {
  const ranked = [...match.players].sort((a,b)=>Number(b.score)-Number(a.score))
  return <main className="page match-page">
    <header className="match-header">
      <div><p className="eyebrow">{windName[match.current_wind]}风 · 第 {match.current_hand} 局</p><h2>雀局进行中</h2></div>
      <button className="share-code" onClick={()=>navigator.clipboard.writeText(`${location.origin}/?match=${match.share_code}`)}><Copy size={14}/>{match.share_code}</button>
    </header>
    <section className="scoreboard">
      {ranked.map((p,i)=><article className="player-score" key={p.id}>
        <div className="rank-badge">{i===0?<Crown size={15}/>:i+1}</div><Avatar player={p}/><div className="player-meta"><b>{p.name}</b><span>{['东','南','西','北'][p.seat]}家</span></div>
        <strong className={Number(p.score)>=0?'positive':'negative'}>{Number(p.score)>0?'+':''}{Number(p.score)}</strong>
      </article>)}
    </section>
    <section className="round-summary"><span>已完成</span><b>{match.hands.length} 局</b><span>·</span><span>总分守恒</span></section>
    <button className="primary giant" onClick={onAdd} disabled={loading}><Plus/> 记一局</button>
    <div className="secondary-actions"><button onClick={onUndo} disabled={!match.hands.length||loading}><RotateCcw size={17}/>撤销上一局</button><button onClick={onFinish} disabled={loading}><BarChart3 size={17}/>结束本将</button></div>
    {match.hands.length>0 && <section className="recent"><h3>最近记录</h3>{match.hands.slice(0,5).map(h=><div className="history-row" key={h.id}><span>{windName[h.wind]}{h.hand_number}</span><b>{typeName[h.result_type]}</b><small>{h.note||`第 ${h.sequence} 局`}</small></div>)}</section>}
  </main>
}

function ScoreModal({players,onClose,onSubmit,loading}:{players:Player[];onClose:()=>void;onSubmit:(x:any)=>void;loading:boolean}) {
  const [type,setType] = useState<'ron'|'tsumo'|'draw'|'custom'>('ron')
  const [winner,setWinner] = useState(players[0].id)
  const [loser,setLoser] = useState(players[1].id)
  const [amount,setAmount] = useState(100)
  const [payments,setPayments] = useState<Record<string,number>>(()=>Object.fromEntries(players.map(p=>[p.id,p.id===players[0].id?0:50])))
  const [custom,setCustom] = useState<Record<string,number>>(()=>Object.fromEntries(players.map(p=>[p.id,0])))

  useEffect(()=>{ if(winner===loser) setLoser(players.find(p=>p.id!==winner)!.id) },[winner])
  const totalCustom = Object.values(custom).reduce((a,b)=>a+Number(b),0)

  function build() {
    if(type==='ron') return {type,winnerPlayerId:winner,loserPlayerId:loser,scores:players.map(p=>({playerId:p.id,change:p.id===winner?amount:p.id===loser?-amount:0}))}
    if(type==='tsumo') {
      const paid = players.filter(p=>p.id!==winner).reduce((sum,p)=>sum+Math.max(0,Number(payments[p.id]||0)),0)
      return {type,winnerPlayerId:winner,scores:players.map(p=>({playerId:p.id,change:p.id===winner?paid:-Math.max(0,Number(payments[p.id]||0))}))}
    }
    if(type==='draw') return {type,scores:players.map(p=>({playerId:p.id,change:0})),note:'流局'}
    return {type,scores:players.map(p=>({playerId:p.id,change:Number(custom[p.id]||0)}))}
  }

  return <div className="modal-backdrop"><section className="modal-card">
    <header><div><p className="eyebrow">NEW HAND</p><h2>本局结果</h2></div><button className="icon-btn" onClick={onClose}><X/></button></header>
    <div className="tabs">{(['ron','tsumo','draw','custom'] as const).map(t=><button className={type===t?'active':''} onClick={()=>setType(t)} key={t}>{typeName[t]}</button>)}</div>
    {(type==='ron'||type==='tsumo') && <><p className="field-title">谁胡了？</p><div className="player-picker">{players.map(p=><button className={winner===p.id?'selected':''} onClick={()=>setWinner(p.id)} key={p.id}><Avatar player={p}/><span>{p.name}</span></button>)}</div></>}
    {type==='ron' && <><p className="field-title">谁放炮？</p><div className="player-picker">{players.filter(p=>p.id!==winner).map(p=><button className={loser===p.id?'selected danger':''} onClick={()=>setLoser(p.id)} key={p.id}><Avatar player={p}/><span>{p.name}</span></button>)}</div><Amount value={amount} setValue={setAmount}/></>}
    {type==='tsumo' && <div className="payments"><p className="field-title">其他玩家支付</p>{players.filter(p=>p.id!==winner).map(p=><label key={p.id}><span>{p.name}</span><input type="number" value={payments[p.id]} onChange={e=>setPayments({...payments,[p.id]:Number(e.target.value)})}/></label>)}</div>}
    {type==='draw' && <div className="empty-state">🀫<b>本局流局</b><span>四位玩家分数不变</span></div>}
    {type==='custom' && <div className="payments"><p className="field-title">录入四人分数变化</p>{players.map(p=><label key={p.id}><span>{p.name}</span><input type="number" value={custom[p.id]} onChange={e=>setCustom({...custom,[p.id]:Number(e.target.value)})}/></label>)}<div className={totalCustom===0?'sum-ok':'sum-error'}>合计：{totalCustom} {totalCustom===0?'✓':'（必须为 0）'}</div></div>}
    <button className="primary giant" disabled={loading||(type==='custom'&&totalCustom!==0)} onClick={()=>onSubmit(build())}>{loading?'保存中…':'确认本局'}</button>
  </section></div>
}

function Amount({value,setValue}:{value:number;setValue:(n:number)=>void}) {
  return <div className="amount-box"><p className="field-title">分数</p><div className="amount-control"><button onClick={()=>setValue(Math.max(0,value-10))}>−</button><input type="number" value={value} onChange={e=>setValue(Math.max(0,Number(e.target.value)))}/><button onClick={()=>setValue(value+10)}>＋</button></div><div className="chips">{[20,50,100,200].map(n=><button key={n} onClick={()=>setValue(n)}>{n}</button>)}</div></div>
}

function StatsScreen({match,stats,onReset}:{match:Match;stats:Stats;onReset:()=>void}) {
  const champion = stats.players[0]
  const pct=(n:number)=>`${(n*100).toFixed(1)}%`
  return <main className="page stats-page">
    <section className="winner-card"><Trophy size={42}/><p>本将冠军</p><Avatar player={champion} large/><h1>{champion.name}</h1><strong>{Number(champion.score)>0?'+':''}{champion.score}</strong><span>共完成 {stats.totalHands} 局</span></section>
    <section className="ranking"><h3>最终排名</h3>{stats.players.map(p=><article key={p.id}><span className="place">{p.rank}</span><Avatar player={p}/><b>{p.name}</b><strong className={Number(p.score)>=0?'positive':'negative'}>{Number(p.score)>0?'+':''}{p.score}</strong></article>)}</section>
    <section className="stat-cards">{stats.players.map(p=><article key={p.id}><div className="stat-person"><Avatar player={p}/><div><b>{p.name}</b><span>第 {p.rank} 名</span></div></div><div className="metrics"><div><b>{p.wins}</b><span>胡牌</span></div><div><b>{p.tsumo}</b><span>自摸</span></div><div><b>{p.deal_in}</b><span>放炮</span></div><div><b>{pct(p.winRate)}</b><span>胡牌率</span></div><div><b>{pct(p.tsumoShare)}</b><span>自摸占比</span></div><div><b>{pct(p.dealInRate)}</b><span>放炮率</span></div></div></article>)}</section>
    <div className="share-panel"><span>牌局分享码</span><b>{match.share_code}</b><button onClick={()=>navigator.clipboard.writeText(`${location.origin}/?match=${match.share_code}`)}><Copy size={16}/>复制链接</button></div>
    <button className="primary giant" onClick={onReset}><Plus/> 再开一将</button>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
