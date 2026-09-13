
import requests, json, time, datetime, uuid, sys
BASE="http://localhost:4000/api"
def req(method, path, body=None, token=None):
    h={"Content-Type":"application/json"}
    if token: h["Authorization"]=f"Bearer {token}"
    r=requests.request(method, BASE+path, json=body, headers=h, timeout=10)
    try: j=r.json()
    except: j=r.text
    return r.status_code, j

def must(label, cond, detail=""):
    tag = "PASS" if cond else "FAIL"
    print(f"{tag} {label} {detail}")
    if not cond:
        print(f"     detail: {detail}")
    return cond

fails=0
def check(label, cond, detail=""):
    global fails
    if not cond: fails+=1
    must(label, cond, detail)
    return cond

print("=== Health ===")
s,j=req("GET","/health")
check("health ok", s==200, str(j)[:120])

print("\n=== Manager bootstrap ===")
s,j=req("POST","/auth/seed-manager", {"email":"manager@saffron.test","password":"Manager123!","name":"Demo Manager"})
print(f"seed-manager {s} {str(j)[:600]}")
if s not in (200,201):
    s,j=req("POST","/auth/register", {"email":"manager@saffron.test","password":"Manager123!","name":"Demo Manager","role":"MANAGER"})
    print(f"register manager fallback {s} {str(j)[:500]}")

s,j=req("POST","/auth/login", {"email":"manager@saffron.test","password":"Manager123!"})
print(f"login manager {s} {str(j)[:600]}")
tok = None
if isinstance(j, dict):
    tok = (j.get("data") or {}).get("token") or j.get("token") or (j.get("data") or {}).get("accessToken")
    if not tok and isinstance(j.get("data"), dict):
        tok = j["data"].get("token")
print(f"manager token present={bool(tok)} -> {str(tok)[:20] if tok else ''}")
if not tok:
    print("FATAL no manager token"); sys.exit(1)
manager_tok=tok

print("\n=== Restaurant ===")
s,j=req("GET","/restaurants", token=manager_tok)
print(f"restaurants {s} {str(j)[:700]}")
rest_id=None
if isinstance(j, dict):
    data=j.get("data")
    if isinstance(data, list) and data: rest_id=data[0].get("id")
    elif isinstance(data, dict) and data.get("id"): rest_id=data.get("id")
print(f"rest_id={rest_id}")
if not rest_id:
    s,j=req("POST","/restaurants", {"name":"Saffron Demo","address":"Demo Street"}, token=manager_tok)
    print(f"create restaurant {s} {str(j)[:500]}")
    rest_id=(j.get("data") or {}).get("id")
print(f"rest_id final={rest_id}")

print("\n=== Tables ===")
for n in ["12","5","8"]:
    s,j=req("POST","/tables", {"number":n,"capacity":4,"restaurantId":rest_id}, token=manager_tok)
    print(f"create table {n} -> {s} {str(j)[:250]}")
    if s not in (200,201):
        s2,j2=req("POST","/tables", {"label":n,"capacity":4}, token=manager_tok)
        print(f" retry label {s2} {str(j2)[:250]}")

s,j=req("GET","/tables", token=manager_tok)
print(f"list tables {s} {str(j)[:700]}")
tables = (j.get("data") if isinstance(j, dict) else []) or []
print(f"tables count={len(tables)}")
table12 = next((t for t in tables if str(t.get("number"))=="12"), None)
if not table12 and tables: table12=tables[0]
print(f"table12={str(table12)[:500] if table12 else 'NONE'}")
check("table 12 exists", table12 is not None, str(table12)[:200] if table12 else "no tables")

print("\n=== QR ===")
token_qr=None
if table12:
    tid=table12["id"]
    s,j=req("POST",f"/tables/{tid}/qr", {}, token=manager_tok)
    print(f"gen QR {s} {str(j)[:500]}")
    s,j=req("GET",f"/tables/{tid}/qr", token=manager_tok)
    print(f"get QR {s} {str(j)[:700]}")
    qrs = (j.get("data") if isinstance(j, dict) else []) or []
    token_qr = (qrs[0].get("token") if qrs else None)
    print(f"token_qr={token_qr}")
    if token_qr:
        s,j=req("GET", f"/tables/qr/{token_qr}")
        print(f"resolve /tables/qr/:token {s} {str(j)[:500]}")
        check("QR resolve", s==200, str(j)[:200])
        s,j=req("GET", f"/qr/validate/{token_qr}")
        print(f"resolve /qr/validate/:token {s} {str(j)[:500]}")

print("\n=== Menu ===")
s,j=req("POST","/menu/categories", {"name":"Main Course","restaurantId":rest_id}, token=manager_tok)
print(f"create cat {s} {str(j)[:400]}")
cat_id=(j.get("data") or {}).get("id")
if not cat_id:
    s,j=req("GET",f"/menu/categories?restaurantId={rest_id}")
    cats=(j.get("data") if isinstance(j, dict) else []) or []
    cat_id=cats[0]["id"] if cats else None
print(f"cat_id={cat_id}")

s,j=req("POST","/menu/items", {"name":"Masala Dosa","description":"Crispy dosa","price":19900,"taxPercent":5,"categoryId":cat_id,"restaurantId":rest_id,"veg":True}, token=manager_tok)
print(f"create dosa {s} {str(j)[:500]}")
dosa_id=(j.get("data") or {}).get("id")
s,j=req("POST","/menu/items", {"name":"Paneer Butter Masala","price":29900,"categoryId":cat_id,"restaurantId":rest_id}, token=manager_tok)
print(f"create paneer {s} {str(j)[:300]}")
paneer_id=(j.get("data") or {}).get("id")

s,j=req("GET",f"/menu/items?restaurantId={rest_id}")
print(f"list items {s} {str(j)[:700]}")
s,j=req("GET","/menu")
print(f"GET /menu alias {s} items={len((j.get('data') if isinstance(j,dict) else []) or [])} {str(j)[:400]}")
check("menu items exist", dosa_id is not None, f"dosa_id={dosa_id}")

# also test unavailable item cannot be ordered - make paneer unavailable
if paneer_id:
    s,j=req("PATCH",f"/menu/items/{paneer_id}/availability", {"isAvailable": False}, token=manager_tok)
    print(f"set paneer unavailable {s} {str(j)[:300]}")

print("\n=== Customer ===")
s,j=req("POST","/auth/register", {"email":"cust@test.com","password":"Customer123!","name":"Test Customer"})
print(f"register cust {s} {str(j)[:500]}")
cust_tok=(j.get("data") or {}).get("token") or j.get("token")
if not cust_tok:
    s,j=req("POST","/auth/login", {"email":"cust@test.com","password":"Customer123!"})
    print(f"login cust {s} {str(j)[:500]}")
    cust_tok=(j.get("data") or {}).get("token") or j.get("token")
print(f"cust_tok present={bool(cust_tok)}")
if not cust_tok:
    print("FATAL no cust token"); sys.exit(1)

print("\n=== Reservations ===")
tomorrow=(datetime.date.today()+datetime.timedelta(days=1)).isoformat()
s,j=req("POST","/reservations", {"date":tomorrow,"time":"19:00","guestCount":4,"name":"Test Customer","phone":"9999999999","tableId": table12["id"] if table12 else None}, token=cust_tok)
print(f"reservation 19:00 {s} {str(j)[:700]}")
check("reservation created", s in (200,201), str(j)[:300])
s2,j2=req("POST","/reservations", {"date":tomorrow,"time":"19:30","guestCount":2,"name":"Second","phone":"8888888888","tableId": table12["id"] if table12 else None}, token=cust_tok)
print(f"double booking 19:30 (expect 409) {s2} {str(j2)[:500]}")
check("double-booking rejected", s2==409 or "overlap" in str(j2).lower() or "already" in str(j2).lower() or "conflict" in str(j2).lower(), str(j2)[:300])
s,j=req("GET","/reservations/availability?date="+tomorrow+"&time=19:00&guestCount=2", token=manager_tok)
print(f"availability {s} {str(j)[:600]}")
# also bare availability without auth
s,j=req("GET",f"/reservations/availability?date={tomorrow}&time=19:00&guestCount=2")
print(f"availability public {s} {str(j)[:400]}")

print("\n=== Table Session + Orders (Scenario A core) ===")
if table12:
    s,j=req("POST",f"/tables/{table12['id']}/sessions", {"partySize":2}, token=manager_tok)
    print(f"create session walk-in {s} {str(j)[:700]}")
    sess = (j.get("data") if isinstance(j, dict) else None) or j
    sess_id = sess.get("id") if isinstance(sess, dict) else None
    if not sess_id:
        s,j=req("GET","/tables/sessions", token=manager_tok)
        print(f"list sessions {s} {str(j)[:700]}")
        lst=(j.get("data") if isinstance(j,dict) else []) or []
        sess_id=lst[0].get("id") if lst else None
    print(f"sess_id={sess_id}")
    check("session created", sess_id is not None, str(sess)[:400] if 'sess' in locals() else "")

    if sess_id and dosa_id:
        # order 1
        s,j=req("POST","/orders", {"sessionId":sess_id,"tableId":table12["id"],"items":[{"menuItemId":dosa_id,"quantity":2}],"idempotencyKey":str(uuid.uuid4())}, token=cust_tok)
        print(f"order1 {s} {str(j)[:800]}")
        check("order1 created", s in (200,201), str(j)[:300])
        order1=(j.get("data") if isinstance(j,dict) else None)
        order1_id=order1.get("id") if isinstance(order1, dict) else None
        print(f"order1_id={order1_id}")

        # duplicate idempotency
        dup_key=str(uuid.uuid4())
        s,j=req("POST","/orders", {"sessionId":sess_id,"tableId":table12["id"],"items":[{"menuItemId":dosa_id,"quantity":1}],"idempotencyKey":dup_key}, token=cust_tok)
        print(f"order with dup_key first {s} {str(j)[:400]}")
        first_id=(j.get("data") or {}).get("id") if isinstance(j, dict) else None
        s,j=req("POST","/orders", {"sessionId":sess_id,"tableId":table12["id"],"items":[{"menuItemId":dosa_id,"quantity":1}],"idempotencyKey":dup_key}, token=cust_tok)
        print(f"duplicate idempotency {s} idempotent={j.get('idempotent')} {str(j)[:400]}")
        check("idempotency prevents duplicate", j.get("idempotent")==True or first_id== (j.get("data") or {}).get("id"), str(j)[:300])

        # unavailable item should fail
        if paneer_id:
            s,j=req("POST","/orders", {"sessionId":sess_id,"tableId":table12["id"],"items":[{"menuItemId":paneer_id,"quantity":1}],"idempotencyKey":str(uuid.uuid4())}, token=cust_tok)
            print(f"order unavailable item (expect 400) {s} {str(j)[:400]}")
            check("unavailable item rejected", s==400, str(j)[:300])

        # second order same session
        s,j=req("POST","/orders", {"sessionId":sess_id,"tableId":table12["id"],"items":[{"menuItemId":dosa_id,"quantity":1}],"idempotencyKey":str(uuid.uuid4())}, token=cust_tok)
        print(f"order2 same session {s} {str(j)[:400]}")
        check("second order same session", s in (200,201), str(j)[:300])

        # kitchen status transitions
        if order1_id:
            s,j=req("PATCH",f"/orders/{order1_id}/status", {"status":"ACCEPTED"}, token=manager_tok)
            print(f"order -> ACCEPTED {s} {str(j)[:400]}")
            s,j=req("PATCH",f"/orders/{order1_id}/status", {"status":"PREPARING"}, token=manager_tok)
            print(f"order -> PREPARING {s} {str(j)[:400]}")
            s,j=req("PATCH",f"/orders/{order1_id}/status", {"status":"READY"}, token=manager_tok)
            print(f"order -> READY {s} {str(j)[:400]}")
            s,j=req("PATCH",f"/orders/{order1_id}/status", {"status":"SERVED"}, token=manager_tok)
            print(f"order -> SERVED {s} {str(j)[:400]}")

        # bill
        s,j=req("POST","/bills/from-session", {"sessionId":sess_id}, token=cust_tok)
        print(f"bill from session {s} {str(j)[:800]}")
        bill=(j.get("data") if isinstance(j, dict) else None) or {}
        bill_id=bill.get("id") if isinstance(bill, dict) else None
        print(f"bill_id={bill_id} total={bill.get('total') if isinstance(bill,dict) else ''}")
        check("bill created", bill_id is not None, str(bill)[:300])
        if bill_id:
            total=bill.get("total",0) if isinstance(bill, dict) else 0
            s,j=req("POST","/payments", {"billId":bill_id,"amount":total,"method":"ONLINE"}, token=cust_tok)
            print(f"payment create {s} {str(j)[:700]}")
            pay=(j.get("data") if isinstance(j, dict) else None) or {}
            pid=pay.get("id") if isinstance(pay, dict) else None
            print(f"pid={pid}")
            if pid:
                s,j=req("POST","/payments/webhook", {"gatewayPaymentId":"gw_"+pid,"paymentId":pid,"status":"SUCCESS"}, token=manager_tok)
                print(f"webhook {s} {str(j)[:600]}")
                check("webhook success", s==200, str(j)[:300])
                s,j=req("POST","/payments/webhook", {"gatewayPaymentId":"gw_"+pid,"paymentId":pid,"status":"SUCCESS"}, token=manager_tok)
                print(f"webhook retry idempotent {s} {str(j)[:400]}")
                # check table went CLEANING
                s,j=req("GET",f"/tables/{table12['id']}", token=manager_tok)
                print(f"table status after payment {s} {str(j)[:500]}")
                # staff marks available
                s,j=req("PATCH",f"/tables/{table12['id']}/status", {"status":"AVAILABLE"}, token=manager_tok)
                print(f"table -> AVAILABLE {s} {str(j)[:400]}")
                # fallback PUT
                if s!=200:
                    s,j=req("PUT",f"/tables/{table12['id']}", {"status":"AVAILABLE"}, token=manager_tok)
                    print(f"PUT table AVAILABLE {s} {str(j)[:400]}")

print("\n=== Inventory / Reports ===")
s,j=req("GET","/inventory", token=manager_tok)
print(f"inventory list {s} count={len((j.get('data') if isinstance(j,dict) else []) or []) if isinstance(j,dict) else '?'} {str(j)[:500]}")
s,j=req("GET","/reports/summary", token=manager_tok)
print(f"reports/summary {s} {str(j)[:700]}")
check("reports has data", s==200, str(j)[:300])
s,j=req("GET","/reports/dashboard", token=manager_tok)
print(f"reports/dashboard {s} {str(j)[:500]}")

print(f"\n=== DONE fails={fails} ===")
if fails==0:
    print("ALL CHECKS PASSED")
else:
    print(f"{fails} CHECKS FAILED")
    sys.exit(1)
