<?php
// Simple Docker Folders - storage API.
// POST requests are CSRF-checked by Unraid's local_prepend.php before this runs.

const SDF_DIR   = '/boot/config/plugins/simple.docker.folders';
const SDF_FILE  = SDF_DIR . '/folders.json';
const SDF_ICONS = SDF_DIR . '/icons';
const SDF_MAX_ICON_BYTES = 512 * 1024;

header('Content-Type: application/json');

function fail(string $msg, int $code = 400): void {
  http_response_code($code);
  exit(json_encode(['error' => $msg]));
}

function load(): array {
  $data = json_decode(@file_get_contents(SDF_FILE) ?: '', true);
  return is_array($data) && isset($data['folders']) && is_array($data['folders']) ? $data : ['folders' => []];
}

function save(array $data): void {
  $tmp = SDF_FILE . '.tmp';
  if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false || !rename($tmp, SDF_FILE)) {
    fail('Could not write ' . SDF_FILE, 500);
  }
}

function valid_id($id): bool {
  return is_string($id) && preg_match('/^[a-f0-9]{8}$/', $id);
}

@mkdir(SDF_ICONS, 0777, true);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') exit(json_encode(load()));

// Serialise writers so two browser tabs can't clobber each other.
$lock = fopen(SDF_DIR . '/.lock', 'c');
flock($lock, LOCK_EX);
$data = load();

switch ($_POST['action'] ?? '') {
case 'save':
  $id = $_POST['id'] ?? '';
  if ($id === '') $id = bin2hex(random_bytes(4));
  if (!valid_id($id)) fail('Invalid folder id');

  $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($_POST['name'] ?? '')));
  if ($name === '' || mb_strlen($name) > 64) fail('Folder name must be 1-64 characters');

  $members = array_values(array_unique(array_filter(
    array_map('strval', (array)($_POST['containers'] ?? [])),
    fn($n) => preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/', $n)
  )));

  $index = array_search($id, array_column($data['folders'], 'id'), true);
  $folder = $index === false ? ['id' => $id, 'icon' => 0] : $data['folders'][$index];
  $folder['name'] = $name;
  $folder['containers'] = $members;

  // A container lives in exactly one folder.
  foreach ($data['folders'] as &$other) {
    if ($other['id'] !== $id) $other['containers'] = array_values(array_diff($other['containers'], $members));
  }
  unset($other);

  $icon = $_POST['icon'] ?? 'keep';
  if ($icon === 'remove') {
    @unlink(SDF_ICONS . "/$id.png");
    $folder['icon'] = 0;
  } elseif ($icon !== 'keep') {
    if (!preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $icon, $m)) fail('Icon must be a PNG');
    $png = base64_decode($m[1], true);
    if ($png === false || strlen($png) > SDF_MAX_ICON_BYTES) fail('Icon is too large');
    if (substr($png, 0, 8) !== "\x89PNG\r\n\x1a\n") fail('Icon must be a PNG');
    if (file_put_contents(SDF_ICONS . "/$id.png", $png) === false) fail('Could not write icon', 500);
    $folder['icon'] = time();
  }

  if ($index === false) $data['folders'][] = $folder; else $data['folders'][$index] = $folder;
  break;

case 'delete':
  $id = $_POST['id'] ?? '';
  if (!valid_id($id)) fail('Invalid folder id');
  $data['folders'] = array_values(array_filter($data['folders'], fn($f) => $f['id'] !== $id));
  @unlink(SDF_ICONS . "/$id.png");
  break;

default:
  fail('Unknown action');
}

save($data);
echo json_encode($data);
