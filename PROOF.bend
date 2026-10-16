import Base
import ./LAWS.bend as Laws

def Laws.incomplete_denied(version, covered, reviewed, snapshot):
  {==}

def Laws.stale_denied(ready, covered, reviewed, snapshot):
  match ready:
    case False{}:
      {==}
    case True{}:
      {==}

def Laws.uncovered_denied(ready, version, reviewed, snapshot):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          {==}

def Laws.pending_denied(ready, version, covered, snapshot):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          match covered:
            case False{}:
              {==}
            case True{}:
              {==}

def Laws.snapshot_mismatch_denied(ready, version, covered, reviewed):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          match covered:
            case False{}:
              {==}
            case True{}:
              match reviewed:
                case False{}:
                  {==}
                case True{}:
                  {==}

def Laws.complete_allowed():
  {==}

def Laws.restore_unauthorized_denied(current, known, unambiguous):
  {==}

def Laws.restore_stale_denied(authorized, known, unambiguous):
  match authorized:
    case False{}:
      {==}
    case True{}:
      {==}

def Laws.restore_unknown_denied(authorized, current, unambiguous):
  match authorized:
    case False{}:
      {==}
    case True{}:
      match current:
        case False{}:
          {==}
        case True{}:
          {==}

def Laws.restore_ambiguous_denied(authorized, current, known):
  match authorized:
    case False{}:
      {==}
    case True{}:
      match current:
        case False{}:
          {==}
        case True{}:
          match known:
            case False{}:
              {==}
            case True{}:
              {==}

def Laws.restore_complete_allowed():
  {==}

def Laws.auto_ready_denied(version, covered, decided, snapshot, origin):
  {==}

def Laws.auto_version_denied(ready, covered, decided, snapshot, origin):
  match ready:
    case False{}:
      {==}
    case True{}:
      {==}

def Laws.auto_covered_denied(ready, version, decided, snapshot, origin):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          {==}

def Laws.auto_decided_denied(ready, version, covered, snapshot, origin):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          match covered:
            case False{}:
              {==}
            case True{}:
              {==}

def Laws.auto_snapshot_denied(ready, version, covered, decided, origin):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          match covered:
            case False{}:
              {==}
            case True{}:
              match decided:
                case False{}:
                  {==}
                case True{}:
                  {==}

def Laws.auto_origin_denied(ready, version, covered, decided, snapshot):
  match ready:
    case False{}:
      {==}
    case True{}:
      match version:
        case False{}:
          {==}
        case True{}:
          match covered:
            case False{}:
              {==}
            case True{}:
              match decided:
                case False{}:
                  {==}
                case True{}:
                  match snapshot:
                    case False{}:
                      {==}
                    case True{}:
                      {==}

def Laws.auto_complete_allowed():
  {==}
