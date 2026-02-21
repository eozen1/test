import csv
import os
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class CSVConfig:
    delimiter: str = ','
    quotechar: str = '"'
    has_header: bool = True
    encoding: str = 'utf-8'


class CSVProcessor:
    def __init__(self, filepath: str, config: Optional[CSVConfig] = None):
        self.filepath = filepath
        self.config = config or CSVConfig()
        self._data: List[Dict[str, str]] = []
        self._headers: List[str] = []

    def load(self) -> 'CSVProcessor':
        with open(self.filepath, 'r', encoding=self.config.encoding) as f:
            reader = csv.reader(f, delimiter=self.config.delimiter, quotechar=self.config.quotechar)

            if self.config.has_header:
                self._headers = next(reader)
                for row in reader:
                    self._data.append(dict(zip(self._headers, row)))
            else:
                for i, row in enumerate(reader):
                    self._data.append({f'col_{j}': val for j, val in enumerate(row)})

        return self

    def filter_rows(self, column: str, value: str) -> List[Dict[str, str]]:
        return [row for row in self._data if row.get(column) == value]

    def get_column(self, column: str) -> List[str]:
        return [row[column] for row in self._data if column in row]

    def sort_by(self, column: str, reverse: bool = False) -> List[Dict[str, str]]:
        return sorted(self._data, key=lambda row: row.get(column, ''), reverse=reverse)

    def write(self, output_path: str, data: Optional[List[Dict[str, str]]] = None):
        rows = data or self._data
        if not rows:
            return

        headers = list(rows[0].keys())
        with open(output_path, 'w', newline='', encoding=self.config.encoding) as f:
            writer = csv.DictWriter(f, fieldnames=headers, delimiter=self.config.delimiter)
            writer.writeheader()
            writer.writerows(rows)

    @property
    def row_count(self) -> int:
        return len(self._data)

    @property
    def columns(self) -> List[str]:
        return self._headers.copy()

    def aggregate(self, column: str) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for row in self._data:
            val = row.get(column, '')
            counts[val] = counts.get(val, 0) + 1
        return counts

    def merge(self, other: 'CSVProcessor', on: str) -> List[Dict[str, str]]:
        other_lookup = {}
        for row in other._data:
            key = row.get(on, '')
            if key not in other_lookup:
                other_lookup[key] = row

        merged = []
        for row in self._data:
            key = row.get(on, '')
            if key in other_lookup:
                combined = {**row, **other_lookup[key]}
                merged.append(combined)

        return merged


def batch_process(directory: str, config: Optional[CSVConfig] = None) -> Dict[str, int]:
    results = {}
    for filename in os.listdir(directory):
        if filename.endswith('.csv'):
            processor = CSVProcessor(os.path.join(directory, filename), config)
            processor.load()
            results[filename] = processor.row_count
    return results
