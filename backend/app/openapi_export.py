"""Print the OpenAPI contract: python -m app.openapi_export > ../frontend/openapi.json

Used by CI (contract job) and by scripts/api-types.sh so the committed file is byte identical everywhere.
"""

import json
import sys

from app.main import app

if __name__ == "__main__":
    sys.stdout.write(json.dumps(app.openapi(), indent=2) + "\n")
