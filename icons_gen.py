from PIL import Image, ImageDraw
import math

def lerp(a,b,t): return a+(b-a)*t

def radial(size=(1024,1024), c1=(11,16,32), c2=(42,32,110)):
    im = Image.new('RGBA', size, (0,0,0,0))
    px = im.load()
    cx,cy = size[0]/2, size[1]/2
    R = max(cx,cy)
    for y in range(size[1]):
        for x in range(size[0]):
            d = math.hypot(x-cx,y-cy)/R
            t = min(1.0,d)
            r=int(lerp(c1[0],c2[0],t)); g=int(lerp(c1[1],c2[1],t)); b=int(lerp(c1[2],c2[2],t))
            px[x,y]=(r,g,b,255)
    return im

def body_grad(size,c1=(79,216,224),c2=(30,110,190)):
    im=Image.new('RGBA',size,(0,0,0,0)); px=im.load()
    w,h=size
    for y in range(h):
        t=y/h
        r=int(lerp(c1[0],c2[0],t));g=int(lerp(c1[1],c2[1],t));b=int(lerp(c1[2],c2[2],t))
        for x in range(w):
            px[x,y]=(r,g,b,255)
    return im

def make_icon(mask_only=False, size=512):
    S = 1024
    scale = S/512.0
    full = Image.new('RGBA',(S,S),(0,0,0,0))
    bg = radial((S,S),(11,16,32),(42,32,110))
    if mask_only:
        full = bg.convert('RGBA').copy()
    else:
        mask=Image.new('L',(S,S),0); dmd=ImageDraw.Draw(mask)
        rad=int(210*scale); dmd.rounded_rectangle([0,0,S-1,S-1],radius=rad,fill=255)
        full=Image.composite(bg,full,mask)
    d=ImageDraw.Draw(full)

    def px(v): return int(v*scale)
    cx = S/2
    top = int(150*scale)
    bw,bh = int(330*scale), int(360*scale)
    body=Image.new('RGBA',(S,S),(0,0,0,0))
    bd=ImageDraw.Draw(body)
    bd.ellipse([cx-bw/2, top, cx+bw/2, top+bh], fill=(255,255,255,255))
    bot = top+bh
    bd.rectangle([cx-bw/2, bot-int(40*scale), cx+bw/2, bot], fill=(255,255,255,255))
    grad = body_grad((S,S),(79,216,224),(30,110,190))
    body = Image.composite(grad, Image.new('RGBA',(S,S),(0,0,0,0)), body.split()[3])
    full.alpha_composite(body, (0,0))

    d=ImageDraw.Draw(full)
    # 触角×2 + 玉
    for sgn in (-1,1):
        ax = cx + sgn*int(110*scale)
        d.line([ax, top-int(10*scale), ax, top-int(150*scale)], fill=(120,240,255,255), width=int(26*scale))
        d.ellipse([ax-int(40*scale), top-int(185*scale), ax+int(40*scale), top-int(105*scale)], fill=(150,244,255,255))
    # 目
    ey=int(115*scale); eyy=top+int(150*scale); r=int(78*scale)
    for sgn in (-1,1):
        ex=cx+sgn*ey
        d.ellipse([ex-r,eyy-r,ex+r,eyy+r], fill=(255,255,255,255))
        d.ellipse([ex-r/2.4,eyy-r/2.4,ex+r/2.4,eyy+r/2.4], fill=(20,30,50,255))
        d.ellipse([ex-r/6,eyy-r/6,ex,eyy], fill=(255,255,255,230))
    # 頬
    for sgn in (-1,1):
        fx=cx+sgn*int(205*scale); fy=top+int(250*scale)
        d.ellipse([fx-int(46*scale),fy-int(26*scale),fx+int(46*scale),fy+int(26*scale)], fill=(255,150,170,170))
    # 口
    mx=cx; my=top+int(252*scale); wr=int(90*scale)
    d.arc([mx-wr,my-int(30*scale),mx+wr,my+int(70*scale)], start=10,end=170,fill=(30,45,70,255),width=int(20*scale))
    # ちょこ足
    for sgn in (-1,1):
        f2x=cx+sgn*int(120*scale); f2y=top+bh
        d.ellipse([f2x-int(46*scale),f2y-int(20*scale),f2x+int(46*scale),f2y+int(18*scale)], fill=(30,110,190,255))

    out = full.resize((size,size), Image.LANCZOS)
    return out

make_icon(False,512).save('public/icons/icon-512.png')
make_icon(False,192).save('public/icons/icon-192.png')
make_icon(True,512).save('public/icons/maskable-512.png')
print('icons generated')
