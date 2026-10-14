# Initial formalization of the already agreed export requirements.
# Do not weaken these laws to make an implementation pass.
import Base
import ./packages/core/export-policy.bend as Policy

law incomplete_denied:
  for version: Bool
  for covered: Bool
  for reviewed: Bool
  for snapshot: Bool
  {Policy.eligible(False{}, version, covered, reviewed, snapshot) == False{} : Bool}

law stale_denied:
  for ready: Bool
  for covered: Bool
  for reviewed: Bool
  for snapshot: Bool
  {Policy.eligible(ready, False{}, covered, reviewed, snapshot) == False{} : Bool}

law uncovered_denied:
  for ready: Bool
  for version: Bool
  for reviewed: Bool
  for snapshot: Bool
  {Policy.eligible(ready, version, False{}, reviewed, snapshot) == False{} : Bool}

law pending_denied:
  for ready: Bool
  for version: Bool
  for covered: Bool
  for snapshot: Bool
  {Policy.eligible(ready, version, covered, False{}, snapshot) == False{} : Bool}

law snapshot_mismatch_denied:
  for ready: Bool
  for version: Bool
  for covered: Bool
  for reviewed: Bool
  {Policy.eligible(ready, version, covered, reviewed, False{}) == False{} : Bool}

# Prevent a vacuous "fix" that rejects all valid exports.
law complete_allowed:
  {Policy.eligible(True{}, True{}, True{}, True{}, True{}) == True{} : Bool}

law restore_unauthorized_denied:
  for current: Bool
  for known: Bool
  for unambiguous: Bool
  {Policy.restoreAllowed(False{}, current, known, unambiguous) == False{} : Bool}

law restore_stale_denied:
  for authorized: Bool
  for known: Bool
  for unambiguous: Bool
  {Policy.restoreAllowed(authorized, False{}, known, unambiguous) == False{} : Bool}

law restore_unknown_denied:
  for authorized: Bool
  for current: Bool
  for unambiguous: Bool
  {Policy.restoreAllowed(authorized, current, False{}, unambiguous) == False{} : Bool}

law restore_ambiguous_denied:
  for authorized: Bool
  for current: Bool
  for known: Bool
  {Policy.restoreAllowed(authorized, current, known, False{}) == False{} : Bool}

law restore_complete_allowed:
  {Policy.restoreAllowed(True{}, True{}, True{}, True{}) == True{} : Bool}
