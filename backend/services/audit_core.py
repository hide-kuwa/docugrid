import csv
import hashlib
import io
import json
from typing import Any, Dict, List

from fastapi import UploadFile


class AuditService:
    def __init__(self) -> None:
        self._fingerprint_key = "_taxx_fingerprint"

    async def ingest_csv(self, upload_file: UploadFile) -> List[Dict[str, Any]]:
        """
        CSVを読み込み、行ごとの指紋（Fingerprint）を生成して返す。
        Shift-JIS (日本の会計ソフト) と UTF-8 の両方に対応。
        """
        content = await upload_file.read()
        
        # 文字コード判定ロジック (Version Bの強みを取り込み)
        try:
            # UTF-8-SIG (BOM付き) を優先
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            # 失敗したら Shift-JIS (弥生/freee等のエクスポート対応)
            text = content.decode("shift_jis")

        reader = csv.DictReader(io.StringIO(text))
        records = []
        
        for row in reader:
            record = dict(row)
            # 指紋生成 (Version Aの堅牢なJSONロジックを採用)
            if not record.get(self._fingerprint_key):
                record[self._fingerprint_key] = self._generate_fingerprint(record)
            records.append(record)
            
        return records

    def detect_changes(
        self,
        old_records: List[Dict[str, Any]],
        new_records: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        新旧のレコードリストを比較し、追加・削除・変更なしを分類する。
        """
        old_map = self._records_by_fingerprint(old_records)
        new_map = self._records_by_fingerprint(new_records)

        old_keys = set(old_map.keys())
        new_keys = set(new_map.keys())

        deleted_keys = old_keys - new_keys
        added_keys = new_keys - old_keys
        unchanged_keys = old_keys & new_keys

        # 変更検知レポートの作成
        return {
            "added": [new_map[key] for key in sorted(added_keys)],
            "deleted": [old_map[key] for key in sorted(deleted_keys)],
            "unchanged_count": len(unchanged_keys),
            # 必要であればここに詳細な差分データを含めることも可能
        }

    def _records_by_fingerprint(
        self,
        records: List[Dict[str, Any]],
    ) -> Dict[str, Dict[str, Any]]:
        """リストを指紋をキーとした辞書に変換するヘルパー関数"""
        record_map = {}
        for record in records:
            fingerprint = record.get(self._fingerprint_key)
            if fingerprint:
                record_map[fingerprint] = record
        return record_map

    def _generate_fingerprint(self, record: Dict[str, Any]) -> str:
        """
        行データの内容から一意なハッシュ値を生成する。
        JSONシリアライズすることで、カラム順序の影響を受けにくくする。
        """
        payload = {
            key: value
            for key, value in record.items()
            if key != self._fingerprint_key
        }
        # sort_keys=True により、辞書の順序が変わっても同じ指紋になるようにする
        serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()