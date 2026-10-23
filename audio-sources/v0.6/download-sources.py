from pathlib import Path
import urllib.request
root=Path(__file__).resolve().parent
files={
 'ezwa-helicopter-source.ogg':'https://upload.wikimedia.org/wikipedia/commons/b/b8/Helicopter_over_quiet_n.ogg',
 'ezwa-license-page.html':'https://commons.wikimedia.org/wiki/File:Helicopter_over_quiet_n.ogg',
 'wuxiascrub-heli-source.ogg':'https://opengameart.org/sites/default/files/heli_0.ogg',
 'wuxiascrub-license-page.html':'https://opengameart.org/content/helicopter-sfx',
 'aquinn-helicopter-source.mp3':'https://opengameart.org/sites/default/files/helicopter_0.mp3',
 'aquinn-license-page.html':'https://opengameart.org/content/helicopter-sounds'}
for name,url in files.items():
 request=urllib.request.Request(url,headers={'User-Agent':'LastLightAssetResearch/0.6'})
 with urllib.request.urlopen(request,timeout=40) as response:data=response.read()
 (root/name).write_bytes(data)
 print(name,len(data),flush=True)
