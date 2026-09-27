# Full project backups

Local autosaves are full project folders. Before replacing the working project, stop its server and restore a chosen folder to a separate directory.

GitHub snapshots are encrypted full ZIP archives in the private repository `_snapshots` folder. The recovery key is `backup-recovery-key.bin` in this folder. Keep a separate safe copy of that key; GitHub cannot restore these files without it.

Decrypt a downloaded snapshot:

```powershell
node "D:\!GTAGMARKETPLACE\casino-full-backups\encrypt-backup.cjs" decrypt "D:\downloaded-snapshot.gtbackup" "D:\restored-snapshot.zip"
```

Extract the resulting ZIP to a new folder. Do not overwrite the live project while its server is running.

The automatic save watcher waits eight seconds after a burst of edits, makes a full local copy, then syncs all pending snapshots to GitHub. Upload failures stay logged in `github-sync.log` and retry on later saves.

## Restore any complete GitHub snapshot

Download the repository snapshots folder, keeping all `.gtbackup` files together. Full manifests share unchanged files across snapshots to save upload time and space. Restore into an empty directory:

```powershell
python "D:\!GTAGMARKETPLACE\casino-full-backups\restore-remote-snapshot.py" "D:\downloaded-snapshots" "autosave-TIMESTAMP.gtbackup" "D:\restored-project"
```

The script decrypts the required archives and checks every referenced file checksum.
