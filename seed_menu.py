
import requests, json, sys, time

BASE="http://localhost:4000/api"

def req(method, path, body=None, token=None):
    h={"Content-Type":"application/json"}
    if token: h["Authorization"]=f"Bearer {token}"
    r=requests.request(method, BASE+path, json=body, headers=h, timeout=15)
    try: j=r.json()
    except: j=r.text
    return r.status_code, j

# login manager
s,j=req("POST","/auth/login", {"email":"manager@saffron.test","password":"Manager123!"})
if s!=200:
    s,j=req("POST","/auth/seed-manager", {"email":"manager@saffron.test","password":"Manager123!","name":"Demo Manager"})
    print("seed-manager",s,j)
    s,j=req("POST","/auth/login", {"email":"manager@saffron.test","password":"Manager123!"})
print("login",s, str(j)[:400])
tok=(j.get("data") or {}).get("token")
if not tok:
    print("FATAL no token",j); sys.exit(1)

s,j=req("GET","/restaurants", token=tok)
print("restaurants",s, str(j)[:500])
rest_id=(j.get("data") or [{}])[0].get("id") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("id")
if not rest_id:
    s,j=req("POST","/restaurants", {"name":"Saffron Spice House","address":"MG Road, Pune"}, token=tok)
    rest_id=(j.get("data") or {}).get("id")
print("rest_id", rest_id)
if not rest_id: sys.exit(1)

# Categories to create (slug must be unique)
categories = [
    ("Starters Veg", "starters-veg", 1),
    ("Starters Non-Veg", "starters-non-veg", 2),
    ("Main Course Veg", "main-veg", 3),
    ("Main Course Non-Veg", "main-non-veg", 4),
    ("Biryani & Rice", "biryani-rice", 5),
    ("South Indian", "south-indian", 6),
    ("Breads", "breads", 7),
    ("Beverages", "beverages", 8),
    ("Desserts", "desserts", 9),
]

# check existing
s,j=req("GET", f"/menu/categories?restaurantId={rest_id}", token=tok)
existing = {c["slug"]: c for c in (j.get("data") or [])} if isinstance(j, dict) else {}
print("existing cats", list(existing.keys()))
cat_ids={}
for name, slug, order in categories:
    if slug in existing:
        cat_ids[slug]=existing[slug]["id"]
        print(f"cat exists {name} -> {cat_ids[slug]}")
    else:
        s,j=req("POST","/menu/categories", {"name":name,"slug":slug,"sortOrder":order,"restaurantId":rest_id}, token=tok)
        print(f"create cat {name} -> {s} {str(j)[:400]}")
        if s in (200,201):
            cat_ids[slug]=(j.get("data") or {}).get("id")
        else:
            # retry get
            s2,j2=req("GET", f"/menu/categories?restaurantId={rest_id}")
            for c in (j2.get("data") or []):
                if c["slug"]==slug: cat_ids[slug]=c["id"]

print("cat_ids", cat_ids)

# Menu items: price in paise (e.g. 19900 = Rs 199), tax 5%, imageUrl valid url
# Using reliable unsplash + freepik style urls
items = [
    # Starters Veg
    ("Paneer Tikka", "Char-grilled cottage cheese with peppers & mint chutney", 24900, True, "starters-veg", "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80", True),
    ("Veg Manchurian", "Crispy veg balls in Manchurian sauce", 19900, True, "starters-veg", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80", False),
    ("Hara Bhara Kabab", "Spinach & peas kebab, served with chutney", 18900, True, "starters-veg", "https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&q=80", False),
    ("Crispy Corn Chilli Pepper", "Sweet & spicy crispy corn kernels", 17900, True, "starters-veg", "https://images.unsplash.com/photo-1512621776952-a57141f2eefd?w=600&q=80", False),
    # Starters Non-Veg
    ("Chicken Tikka", "Boneless chicken marinated overnight, tandoor roasted", 29900, False, "starters-non-veg", "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80", True),
    ("Chicken 65", "Hyderabadi style spicy fried chicken", 27900, False, "starters-non-veg", "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=600&q=80", False),
    ("Fish Fry (Surmai)", "Coastal style rava fried seer fish", 32900, False, "starters-non-veg", "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&q=80", False),
    ("Mutton Seekh Kabab", "Minced mutton skewers, charcoal grilled", 35900, False, "starters-non-veg", "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80", False),
    # Main Veg
    ("Paneer Butter Masala", "Creamy tomato gravy with soft paneer cubes", 28900, True, "main-veg", "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&q=80", True),
    ("Dal Tadka", "Yellow dal tempered with ghee & cumin", 17900, True, "main-veg", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&q=80", False),
    ("Veg Kolhapuri", "Mixed veg in spicy Kolhapuri gravy", 24900, True, "main-veg", "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80", False),
    ("Mushroom Masala", "Button mushrooms in onion-tomato masala", 26900, True, "main-veg", "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&q=80", False),
    # Main Non-Veg
    ("Butter Chicken", "Tandoori chicken in rich buttery tomato gravy", 34900, False, "main-non-veg", "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80", True),
    ("Chicken Handi", "Slow cooked chicken in handi with bone", 32900, False, "main-non-veg", "https://images.unsplash.com/photo-1585937421612-70a008356cf63?w=600&q=80", False),
    ("Mutton Curry", "Tender mutton in home-style curry", 44900, False, "main-non-veg", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80", False),
    ("Egg Curry", "Boiled eggs in spicy onion gravy (2 pcs)", 19900, False, "main-non-veg", "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=600&q=80", False),
    # Biryani & Rice
    ("Veg Dum Biryani", "Basmati, seasonal veg, dum cooked, raita", 24900, True, "biryani-rice", "https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?w=600&q=80", True),
    ("Chicken Biryani", "Aromatic basmati & tender chicken, raita & salan", 32900, False, "biryani-rice", "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&q=80", True),
    ("Mutton Biryani", "Slow-cooked mutton & saffron rice", 42900, False, "biryani-rice", "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80", False),
    ("Jeera Rice", "Steamed basmati tempered with cumin & ghee", 14900, True, "biryani-rice", "https://images.unsplash.com/photo-1534939561121-4cf5b94cea77?w=600&q=80", False),
    ("Steamed Rice", "Plain steamed basmati", 12900, True, "biryani-rice", "https://images.unsplash.com/photo-1536304929831-eeed67981d2d?w=600&q=80", False),
    # South Indian
    ("Masala Dosa", "Crispy dosa stuffed with potato masala, chutney & sambar", 14900, True, "south-indian", "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&q=80", True),
    ("Idli Sambar (4 pcs)", "Steamed rice cakes with sambar & chutney", 9900, True, "south-indian", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80", False),
    ("Medu Vada Sambar (2 pcs)", "Crisp lentil doughnuts", 9900, True, "south-indian", "https://images.unsplash.com/photo-1610192244261-3f33de84d237?w=600&q=80", False),
    ("Uttapam", "Thick pancake with onions, tomato & chilli", 12900, True, "south-indian", "https://images.unsplash.com/photo-1505253758473-96b7015fcd40?w=600&q=80", False),
    # Breads
    ("Butter Naan", "Tandoor baked leavened bread with butter", 4900, True, "breads", "https://images.unsplash.com/photo-1626100866746-59f9dccf8b39?w=600&q=80", False),
    ("Garlic Naan", "Naan brushed with garlic butter", 5900, True, "breads", "https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=600&q=80", False),
    ("Tandoori Roti", "Whole wheat tandoor roti", 2900, True, "breads", "https://images.unsplash.com/photo-1595755430040-24e8fd6b3cf6?w=600&q=80", False),
    ("Laccha Paratha", "Flaky layered paratha", 5900, True, "breads", "https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=600&q=80", False),
    # Beverages
    ("Masala Chai", "Kadak masala tea", 4900, True, "beverages", "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600&q=80", False),
    ("Cold Coffee", "Creamy cold coffee with ice cream", 9900, True, "beverages", "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80", False),
    ("Sweet Lassi", "Punjabi sweet yogurt drink", 7900, True, "beverages", "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=80", False),
    ("Fresh Lime Soda", "Sweet / salted / masala", 6900, True, "beverages", "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=600&q=80", False),
    # Desserts
    ("Gulab Jamun (2 pcs)", "Warm milk-solid dumplings in sugar syrup", 9900, True, "desserts", "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&q=80", False),
    ("Rasmalai (2 pcs)", "Soft cottage cheese in saffron milk", 11900, True, "desserts", "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&q=80", False),
    ("Kulfi Falooda", "Malai kulfi with falooda & basil seeds", 12900, True, "desserts", "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&q=80", False),
]

created=0
skipped=0
for name, desc, price, veg, slug, img, featured in items:
    cat_id=cat_ids.get(slug)
    if not cat_id:
        print(f"SKIP {name} no cat {slug}")
        continue
    body={"name":name,"description":desc,"price":price,"taxPercent":5,"categoryId":cat_id,"restaurantId":rest_id,"veg":veg,"imageUrl":img,"isFeatured":featured, "isAvailable": True}
    s,j=req("POST","/menu/items", body, token=tok)
    if s in (200,201):
        created+=1
        print(f"  OK {name} Rs {price//100}")
    elif "already" in str(j).lower() or s==409:
        skipped+=1
        print(f"  SKIP exists {name}")
    else:
        print(f"  FAIL {name} {s} {str(j)[:400]}")

print(f"\nDone created={created} skipped={skipped}")

# verify
s,j=req("GET", f"/menu/items?restaurantId={rest_id}")
print(f"verify items {s} count={len(j.get('data') or []) if isinstance(j, dict) else '?'}")
for it in (j.get("data") or [])[:5]:
    print(f" - {it['name']} Rs{it['price']//100} veg={it['veg']} img={'yes' if it.get('imageUrl') else 'no'} cat={it.get('category',{}).get('name')}")
