# Simple Docker Folders

An Unraid plugin that groups containers on the Docker tab into collapsible folders.

- Click a folder row to expand or collapse it.
- Each folder row has buttons to start, stop or restart all of its containers, and to edit the folder.
- A folder can have a custom image (it is resized to 128×128 PNG in the browser).
- Folders sit at the position of their first container, so Unraid's own drag-sort order still applies.

There are no settings pages, no Dashboard changes, and no background services. It is one small JS file that regroups the existing table rows after Unraid loads them.

## Install

In Unraid, open **Plugins → Install Plugin** and paste:

```
https://raw.githubusercontent.com/Revise0592/unraid-docker-folders/main/simple.docker.folders.plg
```

Requires Unraid 6.12 or later.

## Usage

Click **Add Folder** below the container list. Enter a name, tick the containers, and optionally choose an image. A container can be in only one folder. If you add it to a new folder, it is removed from the old one.

## Data

- `/boot/config/plugins/simple.docker.folders/folders.json` stores the folder definitions.
- `/boot/config/plugins/simple.docker.folders/icons/<id>.png` stores the folder images.
- The expanded or collapsed state of each folder is stored per browser, in `localStorage`.

When you uninstall the plugin, this data is kept. To remove it, delete the directory.

## Development

```
src/usr/local/emhttp/plugins/simple.docker.folders/
  SimpleDockerFolders.page   # loads the CSS/JS on the Docker tab only
  js/folders.js              # grouping, folder actions, edit dialog
  css/folders.css
  include/api.php            # read/save/delete folders (CSRF-checked by Unraid)
  include/icon.php           # serves folder images from flash
```

To release a version:

1. Add a `###<version>` entry under `<CHANGES>` in `simple.docker.folders.plg`.
2. Run `./build.sh [version]`. The default version is today's date. The script builds `archive/*.txz` and writes the version and MD5 into the `.plg`.
3. Commit and push. Unraid gets the `.plg` and the package from the `main` branch.
