import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft, BarChart3, Check, Copy, Crown, History, LogIn,
  LogOut, Moon, Plus, RotateCcw, Sun, UserPlus, X,
} from 'lucide-react'
import type {
  AuthUser, HandInput, Match, MatchSummary, Player, Stats,
} from '../shared/types'
import './styles.css'

const AUTH_KEY = 'mahjong-auth-token'
const CURRENT_KEY = 'mahjong-current'
const animals = ['🐼','🐯','🦊','🐸','🐧','🐵','🦁','🐨','🐰','🐲','🦄','🐙']
const gradients = [
  'linear-gradient(135deg,#ffbc6e,#ff7c61)',
  'linear-gradient(135deg,#6fd7c3,#3da48f)',
  'linear-gradient(135deg,#9e9cff,#6c63d9)',
  'linear-gradient(135deg,#ffd96f,#f2a93b)',
  'linear-gradient(135deg,#7dc5ff,#438bd2)',
  'linear-gradient(135deg,#ff9ec2,#e36192)',
]
const windName:Record<string,string>={east:'东',south:'南',west:'西',north:'北'}
const typeName:Record<string,string>={tsumo:'自摸',ron:'点炮',draw:'流局',custom:'自定义'}
const noteOptions=['无花果','对对胡','混一色','清一色','七对','全球独钓','龙七','花开','杠开','外包']

async function api<T>(url:string, init:RequestInit={}):Promise<T>{
  const auth=localStorage.getItem(AUTH_KEY)
  const response=await fetch(url,{
    ...init,
    headers:{
      'content-type':'application/json',
      ...(auth?{authorization:`Bearer ${auth}`}:{ }),
      ...init.headers,
    },
  })
  const body=await response.json().catch(()=>({})) as T & {error?:string}
  if(!response.ok) throw new Error(body.error||'请求失败')
  return body
}
function writeInit(method:string, body?:unknown, adminToken=''):RequestInit{
  return {
    method,
    body:body===undefined?undefined:JSON.stringify(body),
    headers:adminToken?{'x-admin-token':adminToken}:{},
  }
}
function Avatar({player,large=false}:{player:Player;large?:boolean}){
  const seed=Number(player.avatar_seed||0)
  return <div className={`avatar ${large?'avatar-large':''}`}
    style={{background:gradients[seed%gradients.length]}}>
    {animals[seed%animals.length]}
  </div>
}

type Screen='home'|'create'|'match'|'stats'|'auth'|'history'|'join'

function App(){
  const [screen,setScreen]=useState<Screen>('home')
  const [match,setMatch]=useState<Match|null>(null)
  const [stats,setStats]=useState<Stats|null>(null)
  const [adminToken,setAdminToken]=useState('')
  const [user,setUser]=useState<AuthUser|null>(null)
  const [history,setHistory]=useState<MatchSummary[]>([])
  const [modal,setModal]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [theme,setTheme]=useState<'dark'|'light'>(()=>
    (localStorage.getItem('mahjong-theme') as 'dark'|'light')||'dark')

  useEffect(()=>{
    document.documentElement.dataset.theme=theme
    localStorage.setItem('mahjong-theme',theme)
  },[theme])

  useEffect(()=>{
    const auth=localStorage.getItem(AUTH_KEY)
    if(auth) api<{user:AuthUser}>('/api/auth/me').then(v=>setUser(v.user))
      .catch(()=>localStorage.removeItem(AUTH_KEY))

    const query=new URLSearchParams(location.search).get('match')
    if(query){ openMatch(query,false); return }

    const saved=localStorage.getItem(CURRENT_KEY)
    if(saved) try{
      const value=JSON.parse(saved)
      setAdminToken(value.token||'')
      openMatch(value.id,false)
    }catch{localStorage.removeItem(CURRENT_KEY)}
  },[])

  async function openMatch(idOrCode:string,fromHistory=true){
    setLoading(true);setError('')
    try{
      const {match}=await api<{match:Match}>(`/api/matches/${encodeURIComponent(idOrCode)}`)
      setMatch(match)
      if(fromHistory)setAdminToken('')
      if(match.status==='finished'){
        await loadStats(match.id);setScreen('stats')
      }else setScreen('match')
    }catch(e){setError((e as Error).message)}
    finally{setLoading(false)}
  }
  async function loadStats(id:string){
    setStats(await api<Stats>(`/api/matches/${id}/statistics`))
  }
  async function create(names:string[]){
    setLoading(true);setError('')
    try{
      const data=await api<{match:Match;adminToken:string}>('/api/matches',
        writeInit('POST',{players:names}))
      setMatch(data.match);setAdminToken(data.adminToken);setScreen('match')
      localStorage.setItem(CURRENT_KEY,JSON.stringify({id:data.match.id,token:data.adminToken}))
      if(user) await refreshHistory()
    }catch(e){setError((e as Error).message)}
    finally{setLoading(false)}
  }
  async function submitHand(input:HandInput){
    if(!match)return false
    setLoading(true);setError('')
    try{
      const data=await api<{match:Match}>(`/api/matches/${match.id}/hands`,
        writeInit('POST',input,adminToken))
      setMatch(data.match);setModal(false);return true
    }catch(e){setError((e as Error).message);return false}
    finally{setLoading(false)}
  }
  async function undo(){
    if(!match||!confirm('撤销上一局计分？'))return
    setLoading(true)
    try{
      const data=await api<{match:Match}>(`/api/matches/${match.id}/hands/last`,
        writeInit('DELETE',undefined,adminToken))
      setMatch(data.match)
    }catch(e){setError((e as Error).message)}
    finally{setLoading(false)}
  }
  async function finish(){
    if(!match||!confirm('确定结束本将？结束后不能继续录分。'))return
    setLoading(true)
    try{
      const data=await api<{match:Match}>(`/api/matches/${match.id}/finish`,
        writeInit('POST',undefined,adminToken))
      setMatch(data.match);await loadStats(match.id);setScreen('stats')
    }catch(e){setError((e as Error).message)}
    finally{setLoading(false)}
  }
  async function claimGuest(){
    const saved=localStorage.getItem(CURRENT_KEY)
    if(!saved)return
    try{
      const v=JSON.parse(saved)
      if(v.id&&v.token)await api(`/api/matches/${v.id}/claim`,
        writeInit('POST',undefined,v.token))
    }catch{}
  }
  async function login(username:string,password:string,register:boolean){
    setLoading(true);setError('')
    try{
      const data=await api<{user:AuthUser;token:string}>(
        register?'/api/auth/register':'/api/auth/login',
        writeInit('POST',{username,password}))
      localStorage.setItem(AUTH_KEY,data.token);setUser(data.user)
      await claimGuest();await refreshHistory();setScreen('history')
    }catch(e){setError((e as Error).message);throw e}
    finally{setLoading(false)}
  }
  async function refreshHistory(){
    const data=await api<{matches:MatchSummary[]}>('/api/me/matches')
    setHistory(data.matches)
  }
  async function showHistory(){
    if(!user){setScreen('auth');return}
    setLoading(true)
    try{await refreshHistory();setScreen('history')}
    catch(e){setError((e as Error).message)}
    finally{setLoading(false)}
  }
  async function logout(){
    try{await api('/api/auth/logout',writeInit('POST'))}catch{}
    localStorage.removeItem(AUTH_KEY);setUser(null);setHistory([]);setScreen('home')
  }
  function reset(){
    localStorage.removeItem(CURRENT_KEY)
    setMatch(null);setStats(null);setAdminToken('');setScreen('home')
  }

  return <div className="app-shell">
    <button className="theme-toggle" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>
      {theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}
    </button>
    {error&&<div className="toast" onClick={()=>setError('')}><span>{error}</span><X size={18}/></div>}
    {screen==='home'&&<Home user={user} onStart={()=>setScreen('create')}
      onHistory={showHistory} onJoin={()=>setScreen('join')} onLogout={logout}/>}
    {screen==='create'&&<Create onBack={()=>setScreen('home')} onCreate={create} loading={loading}/>}
    {screen==='join'&&<Join onBack={()=>setScreen('home')} onOpen={code=>openMatch(code,true)} loading={loading}/>}
    {screen==='auth'&&<Auth onBack={()=>setScreen('home')} onSubmit={login} loading={loading}/>}
    {screen==='history'&&user&&<HistoryScreen user={user} matches={history}
      onBack={()=>setScreen('home')} onOpen={m=>openMatch(m.id,true)} onLogout={logout}/>}
    {screen==='match'&&match&&<MatchScreen match={match} onAdd={()=>setModal(true)}
      onUndo={undo} onFinish={finish} loading={loading}/>}
    {screen==='stats'&&match&&stats&&<StatsScreen match={match} stats={stats} onReset={reset}/>}
    {modal&&match&&<ScoreModal players={match.players} onClose={()=>setModal(false)}
      onSubmit={submitHand} loading={loading}/>}
  </div>
}

function Home({user,onStart,onHistory,onJoin,onLogout}:{
  user:AuthUser|null;onStart:()=>void;onHistory:()=>void;onJoin:()=>void;onLogout:()=>void
}){
  return <main className="home page">
    <section className="hero-card"><div className="brand-mark">雀</div>
      <div><h1>雀记</h1><p>四人麻将，轻松记分。</p></div>
    </section>
    <div className="tile-row"><span>🀀</span><span>🀄</span><span>🀅</span><span>🀆</span></div>
    <button className="primary giant" onClick={onStart}><Plus/>开启一将</button>
    <div className="home-actions">
      <button onClick={onHistory}><History/> {user?`${user.username} 的历史牌局`:'登录 / 注册'}</button>
      <button onClick={onJoin}><Copy/>输入分享码</button>
    </div>
    {user&&<button className="text-btn" onClick={onLogout}><LogOut size={16}/>退出登录</button>}
    <section className="feature-grid">
      <div><b>4 圈</b><span>完整一将</span></div>
      <div><b>跨设备</b><span>登录后继续</span></div>
      <div><b>统计</b><span>排名胜率</span></div>
    </section>
  </main>
}

function Create({onBack,onCreate,loading}:{onBack:()=>void;onCreate:(x:string[])=>void;loading:boolean}){
  const [names,setNames]=useState(['','','',''])
  const can=names.every(n=>n.trim())&&new Set(names.map(n=>n.trim())).size===4
  return <main className="page"><Header onBack={onBack} eyebrow="NEW MATCH" title="谁来上桌？"/>
    <p className="muted">录入四位玩家姓名，系统自动生成头像。</p>
    <section className="name-list">{names.map((name,i)=><label className="name-input" key={i}>
      <div className="avatar" style={{background:gradients[i]}}>{animals[i]}</div>
      <div><span>{['东家','南家','西家','北家'][i]}</span>
        <input value={name} maxLength={12} placeholder={`玩家 ${i+1}`}
          onChange={e=>setNames(names.map((v,j)=>j===i?e.target.value:v))}/></div>
    </label>)}</section>
    <button className="primary giant bottom-action" disabled={!can||loading}
      onClick={()=>onCreate(names.map(n=>n.trim()))}>
      {loading?'创建中…':'开始计分'}<Check/>
    </button>
  </main>
}

function Join({onBack,onOpen,loading}:{onBack:()=>void;onOpen:(x:string)=>void;loading:boolean}){
  const [code,setCode]=useState('')
  return <main className="page"><Header onBack={onBack} eyebrow="JOIN MATCH" title="查看牌局"/>
    <section className="form-card">
      <label><span>分享码或牌局 ID</span>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
          placeholder="例如：AB12CD"/></label>
      <button className="primary giant" disabled={!code.trim()||loading}
        onClick={()=>onOpen(code.trim())}>打开牌局</button>
    </section>
  </main>
}

function Auth({onBack,onSubmit,loading}:{
  onBack:()=>void;onSubmit:(u:string,p:string,r:boolean)=>Promise<void>;loading:boolean
}){
  const [register,setRegister]=useState(false),[username,setUsername]=useState('')
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('')
  const [localError,setLocalError]=useState('')
  async function submit(){
    setLocalError('')
    if(register&&password!==confirm){setLocalError('两次密码不一致');return}
    try{await onSubmit(username.trim(),password,register)}catch{}
  }
  return <main className="page"><Header onBack={onBack}
    eyebrow="ACCOUNT" title={register?'注册账号':'登录雀记'}/>
    <section className="form-card">
      <label><span>用户名</span><input value={username} autoComplete="username"
        onChange={e=>setUsername(e.target.value)} placeholder="3–24 位"/></label>
      <label><span>密码</span><input value={password} type="password"
        autoComplete={register?'new-password':'current-password'}
        onChange={e=>setPassword(e.target.value)} placeholder="至少 8 位"/></label>
      {register&&<label><span>确认密码</span><input value={confirm} type="password"
        onChange={e=>setConfirm(e.target.value)}/></label>}
      {localError&&<p className="form-error">{localError}</p>}
      <button className="primary giant" disabled={loading||!username.trim()||password.length<8}
        onClick={submit}>{register?<UserPlus/>:<LogIn/>}
        {loading?'处理中…':register?'注册并登录':'登录'}</button>
      <button className="text-btn" onClick={()=>{setRegister(!register);setLocalError('')}}>
        {register?'已有账号？登录':'还没有账号？注册'}
      </button>
    </section>
  </main>
}

function HistoryScreen({user,matches,onBack,onOpen,onLogout}:{
  user:AuthUser;matches:MatchSummary[];onBack:()=>void;onOpen:(m:MatchSummary)=>void;onLogout:()=>void
}){
  return <main className="page"><Header onBack={onBack} eyebrow="MY MATCHES"
    title={`${user.username} 的牌局`}/>
    <button className="text-btn logout" onClick={onLogout}><LogOut size={16}/>退出登录</button>
    {!matches.length&&<div className="empty">🀫<b>暂无历史牌局</b><span>登录后创建的牌局会显示在这里</span></div>}
    <section className="history-list">{matches.map(m=><button className="history-card"
      key={m.id} onClick={()=>onOpen(m)}>
      <div><b>{m.player_names.join(' · ')||'四人牌局'}</b>
        <span>{new Date(m.created_at).toLocaleString()}</span></div>
      <div className="history-meta"><strong>{m.hand_count} 局</strong>
        <span>{m.status==='finished'?'已结束':'进行中'}</span><code>{m.share_code}</code></div>
    </button>)}</section>
  </main>
}

function MatchScreen({match,onAdd,onUndo,onFinish,loading}:{
  match:Match;onAdd:()=>void;onUndo:()=>void;onFinish:()=>void;loading:boolean
}){
  const ranked=[...match.players].sort((a,b)=>b.score-a.score)
  return <main className="page match-page">
    <header className="match-header"><div><p className="eyebrow">
      {windName[match.current_wind]}风 · 第 {match.current_hand} 局</p><h2>雀局进行中</h2></div>
      <button className="share-code" onClick={()=>navigator.clipboard.writeText(
        `${location.origin}/?match=${match.share_code}`)}><Copy size={14}/>{match.share_code}</button>
    </header>
    <section className="scoreboard">{ranked.map((p,i)=><article className="player-score" key={p.id}>
      <div className="rank-badge">{i===0?<Crown size={15}/>:i+1}</div><Avatar player={p}/>
      <div className="player-meta"><b>{p.name}</b><span>{['东','南','西','北'][p.seat]}家</span></div>
      <strong className={p.score>=0?'positive':'negative'}>{p.score>0?'+':''}{p.score}</strong>
    </article>)}</section>
    <section className="round-summary"><span>已完成</span><b>{match.hands.length} 局</b><span>· 总分守恒</span></section>
    <button className="primary giant" onClick={onAdd} disabled={loading}><Plus/>记一局</button>
    <div className="secondary-actions">
      <button onClick={onUndo} disabled={!match.hands.length||loading}><RotateCcw/>撤销上一局</button>
      <button onClick={onFinish} disabled={loading}><BarChart3/>结束本将</button>
    </div>
  </main>
}

function ScoreModal({players,onClose,onSubmit,loading}:{
  players:Player[];onClose:()=>void;onSubmit:(x:HandInput)=>Promise<boolean>;loading:boolean
}){
  const [type,setType]=useState<'ron'|'tsumo'|'draw'|'custom'>('ron')
  const [winner,setWinner]=useState(players[0].id)
  const [loser,setLoser]=useState(players[1].id)
  const [amount,setAmount]=useState(100)
  const [tsumoPayment,setTsumoPayment]=useState(50)
  const [custom,setCustom]=useState<Record<string,number>>(
    Object.fromEntries(players.map(p=>[p.id,0])))
  const [notes,setNotes]=useState<string[]>([])

  useEffect(()=>{
    if(winner===loser)setLoser(players.find(p=>p.id!==winner)!.id)
  },[winner])

  async function save(){
    let scores:{playerId:string;change:number}[]
    if(type==='ron'){
      const value=Math.max(1,Math.round(amount))
      scores=players.map(p=>({playerId:p.id,change:p.id===winner?value:p.id===loser?-value:0}))
    }else if(type==='tsumo'){
      const payment=Math.max(1,Math.round(tsumoPayment))
      const losses=players.filter(p=>p.id!==winner).map(p=>({
        playerId:p.id,change:-payment
      }))
      scores=[...losses,{playerId:winner,change:payment*losses.length}]
    }else if(type==='draw'){
      scores=players.map(p=>({playerId:p.id,change:0}))
    }else{
      scores=players.map(p=>({playerId:p.id,change:Math.round(custom[p.id]||0)}))
      if(scores.reduce((s,x)=>s+x.change,0)!==0){alert('自定义分数之和必须为 0');return}
    }
    await onSubmit({
      type,winnerPlayerId:type==='ron'||type==='tsumo'?winner:undefined,
      loserPlayerId:type==='ron'?loser:undefined,scores,note:notes.length?notes.join('、'):undefined,
    })
  }

  return <div className="modal-backdrop"><section className="modal">
    <header><div><p className="eyebrow">SCORE A HAND</p><h2>记一局</h2></div>
      <button className="icon-btn" onClick={onClose}><X/></button></header>
    <div className="type-tabs">{(['ron','tsumo','draw','custom'] as const).map(v=>
      <button className={type===v?'active':''} key={v} onClick={()=>setType(v)}>{typeName[v]}</button>)}</div>
    {(type==='ron'||type==='tsumo')&&<>
      <p className="field-title">胡牌者</p><div className="player-picks">{players.map(p=>
        <button className={winner===p.id?'selected':''} key={p.id} onClick={()=>setWinner(p.id)}>
          <Avatar player={p}/><span>{p.name}</span></button>)}</div>
    </>}
    {type==='ron'&&<>
      <p className="field-title">放炮者</p><div className="player-picks">{players.filter(p=>p.id!==winner).map(p=>
        <button className={loser===p.id?'selected':''} key={p.id} onClick={()=>setLoser(p.id)}>
          <Avatar player={p}/><span>{p.name}</span></button>)}</div>
      <label className="score-input"><span>分数</span><input type="number" min="1" value={amount}
        onChange={e=>setAmount(Number(e.target.value))}/></label>
    </>}
    {type==='tsumo'&&<label className="score-input"><span>每人支付</span><input type="number" min="1"
      value={tsumoPayment} onChange={e=>setTsumoPayment(Number(e.target.value))}/></label>}
    {type==='custom'&&<section className="payment-list">{players.map(p=><label key={p.id}>
      <span>{p.name}</span><input type="number" value={custom[p.id]}
        onChange={e=>setCustom({...custom,[p.id]:Number(e.target.value)})}/></label>)}</section>}
    <div className="score-input"><span>备注（可选）</span>
      <div className="note-options">{noteOptions.map(option=><button type="button"
        className={notes.includes(option)?'selected':''} key={option}
        onClick={()=>setNotes(current=>current.includes(option)
          ?current.filter(item=>item!==option):[...current,option])}>{option}</button>)}</div>
    </div>
    <button className="primary giant" disabled={loading} onClick={save}>
      {loading?'保存中…':'确认保存'}<Check/>
    </button>
  </section></div>
}

function StatsScreen({match,stats,onReset}:{match:Match;stats:Stats;onReset:()=>void}){
  return <main className="page"><div className="stats-hero"><p className="eyebrow">FINAL RESULT</p>
    <h1>本将结束</h1><span>共完成 {stats.totalHands} 局</span></div>
    <section className="podium">{stats.players.map(p=><article key={p.id}>
      <span className="rank">#{p.rank}</span><Avatar player={p} large/><b>{p.name}</b>
      <strong className={p.score>=0?'positive':'negative'}>{p.score>0?'+':''}{p.score}</strong>
      <small>胜率 {(p.winRate*100).toFixed(0)}% · 放炮 {(p.dealInRate*100).toFixed(0)}%</small>
      <small>自摸占比 {(p.tsumoShare*100).toFixed(0)}%</small>
    </article>)}</section>
    <button className="primary giant" onClick={onReset}>返回首页</button>
    <p className="footnote">分享码：{match.share_code}</p>
  </main>
}

function Header({onBack,eyebrow,title}:{onBack:()=>void;eyebrow:string;title:string}){
  return <header className="topbar"><button className="icon-btn" onClick={onBack}><ArrowLeft/></button>
    <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></header>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
