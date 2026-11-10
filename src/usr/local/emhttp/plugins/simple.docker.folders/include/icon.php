<?php
// Serves a folder icon from the flash drive. URLs carry ?v=<mtime>, so cache forever.
$id = $_GET['id'] ?? '';
$file = "/boot/config/plugins/simple.docker.folders/icons/$id.png";
if (!preg_match('/^[a-f0-9]{8}$/', $id) || !is_file($file)) {
  http_response_code(404);
  exit;
}
header('Content-Type: image/png');
header('Content-Length: ' . filesize($file));
header('Cache-Control: private, max-age=31536000, immutable');
readfile($file);
