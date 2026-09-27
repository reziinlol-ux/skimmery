import hashlib,io,json,subprocess,sys,tempfile,zipfile
from pathlib import Path
archives=Path(sys.argv[1]).resolve();snapshot=sys.argv[2];destination=Path(sys.argv[3]).resolve()
if destination.exists() and any(destination.iterdir()):raise SystemExit('Restore to a new empty directory.')
destination.mkdir(parents=True,exist_ok=True)
helper=Path(__file__).with_name('encrypt-backup.cjs');cache={}
def archive(name):
 if name not in cache:
  source=archives/name
  if source.parent.resolve()!=archives:raise ValueError('Invalid archive reference.')
  with tempfile.NamedTemporaryFile(suffix='.zip',delete=False) as f:temporary=Path(f.name)
  try:
   subprocess.run(['node',str(helper),'decrypt',str(source),str(temporary)],check=True)
   cache[name]=zipfile.ZipFile(io.BytesIO(temporary.read_bytes()))
  finally:temporary.unlink()
 return cache[name]
selected=archive(snapshot)
if 'manifest.json' not in selected.namelist():
 files={name:{'archive':snapshot,'entry':name} for name in selected.namelist() if not name.endswith('/')};directories=[]
else:
 manifest=json.loads(selected.read('manifest.json'));files=manifest['files'];directories=manifest['directories']
for directory in directories:
 target=(destination/directory).resolve()
 if not target.is_relative_to(destination):raise ValueError('Invalid directory.')
 target.mkdir(parents=True,exist_ok=True)
for name,reference in files.items():
 target=(destination/name).resolve()
 if not target.is_relative_to(destination):raise ValueError('Invalid file path.')
 data=archive(reference['archive']).read(reference['entry'])
 if reference.get('sha256') and hashlib.sha256(data).hexdigest()!=reference['sha256']:raise ValueError('Backup checksum mismatch.')
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
print('Restored '+str(len(files))+' files to '+str(destination))
