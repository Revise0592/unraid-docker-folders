# Simple Docker Folders

An Unraid plugin that groups containers on the Docker tab into collapsible folders.

- Click a folder row to expand or collapse it.
- Each folder row has buttons to start, stop or restart all of its containers, and to edit the folder.
- A folder can have a custom image (it is resized to 128×128 PNG in the browser).
- Folders sit at the position of their first container, so Unraid's own drag-sort order still applies.

There are no settings pages. A docker container folder plugin should not have 20598324095724052094+ options. I just want to group containers to tidy up. If thats also what you want, then this plugin is for you.

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
  images/folder-docker.png   # plugin icon (Plugins page and CA)
```

When a GitHub release is published, `.github/workflows/release.yml` builds and publishes the package.

To build locally, run `./build.sh [version] [notes-file]`. The output goes to `archive/`.
