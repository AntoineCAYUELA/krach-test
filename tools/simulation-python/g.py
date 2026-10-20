# Reference rules for the GDD
from sim import *
import sim
PTS=5; LOSS_FACTOR=0.5
MR={'rsiL','rsiS','rebond','rejet','marteau','etoile'}
def trend_dir(m):
    t=len(m.C)-1; return 1 if sma(m.C,20,t)>sma(m.C,20,t-5) else -1
def evaluate(hand,m,d,items,st):
    base,v,f=setup_multi(hand,m,d,items); v=v[:3]; base,_,f=setup_multi(v,m,d,items)
    add=st.get('carnet',0)+st.get('form',0)
    if 'lecteur' in items: add+=1*sum(FAM[c]=='bougie' for c in v)
    if 'chartiste' in items: add+=1.5*sum(FAM[c]=='niv' for c in v)
    if 'short' in items and d==-1: add+=1
    mul=1
    if 'trend' in items and d==trend_dir(m): mul*=1.5
    if 'quant' in items and len(f)>=2: mul*=2
    return base,add,mul,v,f
def trade(m,d,mise,lev,items,sl,tp,dur=3):
    s=0.0008 if 'teneur' in items else 0.002
    f=0.0004 if 'courtier' in items else 0.001
    N=mise*lev; E=m.C[-1]*(1+d*s/2); X=None; how='time'
    for k in range(dur):
        m.step(); o,h,l,c=m.O[-1],m.H[-1],m.L[-1],m.C[-1]
        worst=l if d==1 else h; best=h if d==1 else l
        if sl is not None:
            slp=E*(1-d*sl)
            if d*(o-slp)<=0: X=o;how='sl';break
            if d*(worst-slp)<=0: X=slp;how='sl';break
        if d*(worst/E-1)*lev<=-0.8: return -mise,'liq'
        if tp is not None:
            tpp=E*(1+d*tp)
            if d*(best-tpp)>=0: X=tpp;how='tp';break
    if X is None: X=m.C[-1]
    Xa=X*(1-d*s/2); r=d*(Xa/E-1)
    return N*r-2*f*N, how
def seance(rng,quota,capital,items,lev=2,boss=None,st=None,ordres=5,defs=3,bougies=24,size=1.0,sigma=None):
    st=st if st is not None else {}
    mods={}; kw={}; sigma=sigma or rng.choice([0.012,0.015,0.02])
    if boss=='krach': mods['regime']='bear'; sigma*=1.5
    if boss=='range': mods['regime']='range'
    if boss=='news': kw['pnews']=0.15
    m=Market(sigma=sigma,rng=rng,mods=mods,**kw)
    deck=DECK[:]+st.get('extra',[]); rng.shuffle(deck); hand=[deck.pop() for _ in range(5)]
    perf=0; time=bougies; trades=0
    sl=0.05 if 'sl' in items else None; tp=0.04 if 'tp' in items else None
    while ordres>0 and time>=3 and perf<quota:
        opts=[]
        for d in (1,-1):
            b,a,mu,v,f=evaluate(hand,m,d,items,st); opts.append(((b+a)*mu*(1+len(v)),d,b,a,mu,v,f))
        opts.sort(key=lambda o:o[0],reverse=True); M,d,b,a,mu,v,f=opts[0]
        nv=len(v); slack=time-3*ordres
        if nv>=2 or (nv==1 and defs==0 and slack<1): pass
        elif defs>0:
            keep=[c for c in hand if valid(c,m,1,items) or valid(c,m,-1,items)]; defs-=1
            while len(keep)<5 and deck: keep.append(deck.pop())
            hand=keep; continue
        elif slack>=1: m.step(); time-=1; continue
        if nv==0:
            d=trend_dir(m); M,d,b,a,mu,v,f=[o for o in opts if o[1]==d][0]
        mise=capital*size; L=lev
        if 'regle2' in items and sl:
            mise=min(capital,0.02*capital/sl/L); mu*=2
        net,how=trade(m,d,mise,L,items,sl,tp)
        time-=3; ordres-=1; trades+=1; capital+=net
        aa=a+(1 if how=='tp' and 'tp' in items else 0)
        pts=PTS*len(v)
        res=pts+net
        if res>=0: perf+=res*(b+aa)*mu
        else: perf=max(0,perf+res*LOSS_FACTOR)
        if 'carnet' in items and net>0 and nv>=2: st['carnet']=min(4,st.get('carnet',0)+0.5)
        for c in v: hand.remove(c)
        while len(hand)<5 and deck: hand.append(deck.pop())
        if capital<10: return perf,capital,False
    return perf,capital,perf>=quota
