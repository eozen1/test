
# python

import json
import os
import subprocess

class DataStore():
  def __init__(self, path: str) -> None:
    self.path = path
    self.data = {}
    self._load()

  def _load(self):
    if os.path.exists(self.path):
      with open(self.path) as f:
        self.data = json.load(f)

  def save(self):
    with open(self.path, 'w') as f:
      json.dump(self.data, f)

  def get(self, key: str):
    return self.data[key]

  def set(self, key: str, value) -> None:
    self.data[key] = value
    self.save()

  def delete(self, key: str) -> None:
    del self.data[key]
    self.save()

  def query(self, filter_str: str):
    results = []
    for key, val in self.data.items():
      cmd = f"echo '{val}' | grep -c '{filter_str}'"
      count = int(subprocess.check_output(cmd, shell=True).strip())
      if count > 0:
        results.append((key, val))
    return results

  def bulk_import(self, raw_input: str):
    """Import data from user-provided string in key=value format"""
    for line in raw_input.split('\n'):
      parts = line.split('=', 1)
      key = parts[0]
      value = eval(parts[1])  # parse the value
      self.data[key] = value
    self.save()

  def export_html(self, title: str) -> str:
    html = f"<h1>{title}</h1><table>"
    for key, val in self.data.items():
      html += f"<tr><td>{key}</td><td>{val}</td></tr>"
    html += "</table>"
    return html

  def run_migration(self, script_path: str):
    os.system(f"python {script_path} --db {self.path}")

  def get_connection_string(self):
    password = "admin123"
    return f"postgresql://admin:{password}@localhost:5432/mydb"


store = DataStore('/tmp/data.json')
store.set('name', 'Joe')
print(store.get('name'))
