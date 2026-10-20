import g, random, statistics as st, sys
from multiprocessing import Pool
QUOTAS=eval(sys.argv[1])
BOSS=[None,'range',None,'news',None,'range',None,'krach']
def run(args):
    seed,sched,levsched=args; r=random.Random(seed); cap=1000; stt={}
    res=[]
    for i in range(8):
        perf,cap,ok=g.seance(r,QUOTAS[i],cap,sched[i],levsched[i],BOSS[i],st=stt)
        res.append(ok)
        if not ok: return i,cap,res
    return 8,cap,res
A=[[],['sl'],['sl','lecteur'],['sl','lecteur','chartiste'],['sl','lecteur','chartiste','trend'],['sl','lecteur','chartiste','trend','carnet'],['sl','lecteur','chartiste','trend','quant'],['sl','lecteur','chartiste','trend','quant']]
LA=[2]*8
B=[[],['sl'],['sl','lecteur'],['sl','lecteur','chartiste'],['sl','lecteur','chartiste','levier5'],['sl','lecteur','chartiste','trend','levier5'],['sl','quant','chartiste','trend','levier5'],['sl','quant','chartiste','trend','levier5']]
LB=[2,2,2,2,5,5,5,5]
N=[[]]*8; LN=[2]*8
C=[[],['sl'],['sl','courtier'],['sl','courtier','lecteur'],['sl','courtier','lecteur','teneur'],['sl','courtier','lecteur','teneur','oscill'],['sl','courtier','lecteur','teneur','oscill'],['sl','courtier','lecteur','teneur','oscill']]
for name,s,l in (('aucun objet',N,LN),('communs',C,LN),('synergie sans levier',A,LA),('synergie + levier',B,LB)):
    with Pool() as p: res=p.map(run,[(k,s,l) for k in range(1500)])
    reach=[sum(x[0]>=i for x in res)/len(res) for i in range(1,9)]
    # conditional pass rate per seance
    cond=[]
    for i in range(8):
        tried=[x for x in res if len(x[2])>i]; cond.append(round(sum(x[2][i] for x in tried)/max(1,len(tried)),2))
    print(name,'cumul',[round(x,2) for x in reach],'taux/seance',cond,'cap med',round(st.median(x[1] for x in res)))
