"""Import the existing authored homepage once, retaining its actual content."""
import json, re
from pathlib import Path
from lxml import html
root=Path(__file__).resolve().parent.parent
s=html.fromstring(re.sub(r'<br\b[^>]*>', ' ', (root/'dist/index.html').read_text()))
def select(sel, parent=s):
 path='.'
 for token in sel.replace('>',' > ').split():
  if token=='>':path+='/';continue
  if not path.endswith('/'):path+='//'
  nth=re.search(r':nth-of-type\((\d+)\)',token)
  if nth:token=token[:token.index(':')]
  if token.startswith('.'):
   path+='*[contains(concat(" ",normalize-space(@class)," ")," '+token[1:]+' ")]'
  elif token.startswith('#'):path+='*[@id="'+token[1:]+'"]'
  else:path+=token
  if nth:path+='['+nth[1]+']'
 return parent.xpath(path)
def text(el):return ' '.join(el.text_content().split())
def txt(sel):
 els=select(sel)
 return text(els[0]) if els else ''
def records(sel, fields):
 return [dict(id=re.sub(r'[^a-zA-Z0-9-]+','-',sel).strip('-')+f'-{i}',status='published',**{k:text(select(v,el)[0]) for k,v in fields.items()}) for i,el in enumerate(select(sel))]
data={
 'home':{'label':txt('.hero .eyebrow'),'line1':txt('.hero-line:nth-of-type(1)'),'line2':txt('.hero-line:nth-of-type(2)'),'line3':txt('.hero-line:nth-of-type(3)'), 'description':txt('.hero-content > p'),'buttonText':'Let’s build something','buttonLink':'#contact','secondaryText':'Explore our services','secondaryLink':'#services','image':'/assets/hero.webp','aboutTitle':txt('.statement-content h2'),'aboutDescription':txt('.statement-content > p'),'servicesTitle':txt('#services h2'),'servicesDescription':txt('#services .section-heading > p'),'projectsTitle':'Selected work','projectsDescription':'A closer look at what we create.','contactTitle':txt('.contact-heading h2'),'contactDescription':txt('.contact-heading > p')},
 'services':records('.service-card',{'name':'h3','shortDescription':'p','tags':'.card-bottom > span','icon':'.service-symbol'}),
 'founders':[{'id':'paruhang','name':'Paruhang Khapung','role':'Founder','email':'Hanglimbu6221@gmail.com','phone':'9817387000','image':'','status':'published'},{'id':'anish','name':'Anish Jha','role':'Founder','email':'anishjha553@gmail.com','phone':'9704341841','image':'','status':'published'}],
 'pricing':records('.price-card',{'name':'h3','description':'p','price':'.price','note':'.price-note','label':'.plan-kicker'}),
 'faq':records('.faq-list details',{'question':'summary','answer':'p'}),
 'projects':[], 'blog':[],
 'settings':{'companyName':'Cloud Nest','tagline':'A home for your next big idea.','logo':'/assets/cloud-nest-logo.png','favicon':'','email':'Hanglimbu6221@gmail.com','phone':'9817387000','address':'','facebook':'','instagram':'','linkedin':'','youtube':'','copyright':'© 2026 Cloud Nest. All rights reserved.'},
 'seo':{'title':txt('title'),'description':s.xpath('//meta[@name="description"]/@content')[0],'slug':'/','ogTitle':'Cloud Nest — Digital Design & Development','ogDescription':'Thoughtful design. Powerful digital experiences.','ogImage':'','keywords':'Cloud Nest, website design, branding, digital marketing, SEO'}
}
for item,el in zip(data['pricing'],select('.price-card')):
 item['features']='\n'.join(text(li) for li in select('li',el));item['recommended']='featured' in el.get('class','')
for item in data['services']:
 item.update(description=item['shortDescription'],deliverables=item['tags'].replace(' · ','\n'),process='Discover your goals\nShape the direction\nCreate and refine\nLaunch and support',image='')
if not data['faq']:
 data['faq']=[dict(id=f'faq-{i}',question=text(select('summary',d)[0]).rstrip('+').strip(),answer=text(select('p',d)[0]),status='published') for i,d in enumerate(select('#faq details'))]
for q in data['faq']:q['question']=q['question'].rstrip('+').strip()
(root/'dist/content-seed.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
