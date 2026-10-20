DRIFT=0.003
import random, math, statistics as st
TICKS=10
class Market:
    def __init__(s, sigma=0.015, drift=None, kappa=0.3, pswitch=0.04, pnews=0.04, rng=None, mods=None):
        s.r=rng; s.sigma=sigma; s.drift=DRIFT if drift is None else drift; s.kappa=kappa; s.ps=pswitch; s.pn=pnews
        s.mods=mods or {}
        s.regime=s.r.choices(['bull','bear','range'],[0.3,0.3,0.4])[0]
        if 'regime' in s.mods: s.regime=s.mods['regime']
        s.P=100.0; s.ref=100.0; s.O=[];s.H=[];s.L=[];s.C=[];s.V=[]
        for _ in range(40): s.step()
    def step(s):
        if 'regime' not in s.mods and s.r.random()<s.ps:
            s.regime=s.r.choice([x for x in ['bull','bear','range'] if x!=s.regime]); s.ref=s.P
        mu={'bull':s.drift,'bear':-s.drift,'range':0}[s.regime]
        news=s.r.random()<s.pn
        o=s.P
        if news:
            sent=s.r.choice([1,-1]); sign=sent if s.r.random()<0.7 else -sent
            o=s.P*(1+sign*s.r.uniform(0.03,0.06))
        p=o;h=o;l=o
        for _ in range(TICKS):
            mr = -s.kappa*math.log(p/s.ref)/TICKS if s.regime=='range' else 0
            p*=math.exp(mu/TICKS+mr+s.sigma/math.sqrt(TICKS)*s.r.gauss(0,1))
            h=max(h,p);l=min(l,p)
        v=10000*(1+2*abs(p/o-1)/s.sigma)*math.exp(s.r.gauss(0,0.3))*(3 if news else 1)
        s.O.append(o);s.H.append(h);s.L.append(l);s.C.append(p);s.V.append(v);s.P=p
def sma(a,n,t): return sum(a[t-n+1:t+1])/n
def rsi(C,t,n=14):
    g=l=0
    for i in range(t-n+1,t+1):
        d=C[i]-C[i-1]
        if d>0:g+=d
        else:l-=d
    if l==0: return 100
    return 100-100/(1+g/l)
FAM={'marteau':'bougie','etoile':'bougie','avalH':'bougie','avalB':'bougie','rsiL':'ind','rsiS':'ind','golden':'ind','death':'ind',
     'rebond':'niv','rejet':'niv','cassH':'niv','cassB':'niv','pic':'vol','volc':'vol'}
DECK=['marteau','etoile','avalH','avalB','rsiL','rsiL','rsiS','rsiS','golden','death','rebond','rebond','rejet','rejet','cassH','cassB','pic','pic','volc','volc']
def valid(card,m,d,items):
    O,H,L,C,V=m.O,m.H,m.L,m.C,m.V; t=len(C)-1
    lo,hi=(35,65) if 'oscill' in items else (30,70)
    body=abs(C[t]-O[t]); lw=min(O[t],C[t])-L[t]; uw=H[t]-max(O[t],C[t])
    sup=min(L[t-20:t]); res=max(H[t-20:t]); s20=sma(C,20,t)
    if card=='marteau': return d==1 and lw>=2*body and uw<=body and C[t]<s20
    if card=='etoile': return d==-1 and uw>=2*body and lw<=body and C[t]>s20
    if card=='avalH': return d==1 and C[t-1]<O[t-1] and C[t]>O[t] and O[t]<=C[t-1] and C[t]>=O[t-1]
    if card=='avalB': return d==-1 and C[t-1]>O[t-1] and C[t]<O[t] and O[t]>=C[t-1] and C[t]<=O[t-1]
    if card=='rsiL': return d==1 and rsi(C,t)<lo
    if card=='rsiS': return d==-1 and rsi(C,t)>hi
    if card in('golden','death'):
        now=sma(C,5,t)-s20; before=[sma(C,5,i)-sma(C,20,i) for i in range(t-3,t)]
        if card=='golden': return d==1 and now>0 and min(before)<=0
        return d==-1 and now<0 and max(before)>=0
    if card=='rebond': return d==1 and L[t]<=sup*1.01 and C[t]>sup
    if card=='rejet': return d==-1 and H[t]>=res*0.99 and C[t]<res
    if card=='cassH': return d==1 and C[t]>res
    if card=='cassB': return d==-1 and C[t]<sup
    avgv=sum(V[t-20:t])/20
    if card=='pic': return V[t]>=2*avgv and (d==1)==(C[t]>O[t])
    if card=='volc': return sum(V[t-2:t+1])/3>=1.3*avgv and (d==1)==(C[t]>C[t-3])
def setup_multi(cards,m,d,items):
    v=[c for c in cards if valid(c,m,d,items)]
    fams=set(FAM[c] for c in v); n=len(v)
    if n==0: base=1
    elif n==1: base=1.5
    elif n==2: base=2 if len(fams)==1 else 2.5
    else: base=4 if len(fams)==3 else 3
    return base,v,fams
