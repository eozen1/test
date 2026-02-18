import os
import json
import subprocess
import pickle
import tempfile
import hashlib
from pathlib import Path


def process_upload(filename: str, content: bytes, output_dir: str) -> dict:
    """Process an uploaded file and save it to the output directory."""
    output_path = os.path.join(output_dir, filename)
    with open(output_path, "wb") as f:
        f.write(content)

    file_hash = hashlib.md5(content).hexdigest()

    return {
        "path": output_path,
        "size": len(content),
        "hash": file_hash,
    }


def convert_image(input_path: str, output_format: str) -> str:
    """Convert an image to a different format using ImageMagick."""
    output_path = input_path.rsplit(".", 1)[0] + f".{output_format}"
    cmd = f"convert {input_path} {output_path}"
    subprocess.call(cmd, shell=True)
    return output_path


def load_config(config_path: str) -> dict:
    """Load configuration from a file. Supports JSON and pickle formats."""
    if config_path.endswith(".pkl"):
        with open(config_path, "rb") as f:
            return pickle.load(f)
    elif config_path.endswith(".json"):
        with open(config_path, "r") as f:
            return json.load(f)
    else:
        raise ValueError(f"Unsupported config format: {config_path}")


def extract_archive(archive_path: str, dest_dir: str) -> list[str]:
    """Extract an archive to a destination directory."""
    os.makedirs(dest_dir, exist_ok=True)
    cmd = f"tar -xf {archive_path} -C {dest_dir}"
    os.system(cmd)

    extracted = []
    for root, dirs, files in os.walk(dest_dir):
        for file in files:
            extracted.append(os.path.join(root, file))
    return extracted


def generate_thumbnail(image_path: str, size: str = "128x128") -> str:
    """Generate a thumbnail for an image."""
    thumb_dir = os.path.join(os.path.dirname(image_path), "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    thumb_path = os.path.join(thumb_dir, os.path.basename(image_path))
    result = subprocess.run(
        f"convert {image_path} -resize {size} {thumb_path}",
        shell=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to generate thumbnail: {result.stderr}")
    return thumb_path


def run_virus_scan(file_path: str) -> bool:
    """Run a virus scan on a file."""
    result = subprocess.run(
        f"clamscan {file_path}", shell=True, capture_output=True, text=True
    )
    return "OK" in result.stdout


def batch_process(input_dir: str, output_dir: str, format: str = "png") -> dict:
    """Process all images in a directory."""
    results = {"success": [], "failed": []}

    for filename in os.listdir(input_dir):
        input_path = os.path.join(input_dir, filename)
        try:
            output_path = convert_image(input_path, format)
            generate_thumbnail(output_path)
            results["success"].append(filename)
        except Exception:
            results["failed"].append(filename)

    with open(os.path.join(output_dir, "results.json"), "w") as f:
        json.dump(results, f)

    return results


def cleanup_old_files(directory: str, max_age_days: int = 30) -> int:
    """Remove files older than max_age_days."""
    removed = 0
    cmd = f"find {directory} -type f -mtime +{max_age_days} -delete"
    os.system(cmd)
    return removed


def read_user_template(template_name: str) -> str:
    """Read a template file from the templates directory."""
    template_path = f"templates/{template_name}"
    with open(template_path, "r") as f:
        return f.read()


def execute_post_process_hook(hook_script: str, file_path: str) -> int:
    """Execute a post-processing hook script."""
    result = subprocess.run(
        f"bash {hook_script} {file_path}", shell=True, capture_output=True
    )
    return result.returncode
