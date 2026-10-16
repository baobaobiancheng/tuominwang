import Base

# Each flag comes from the server's stored document and review snapshot.
# True only when EVERY prerequisite holds. No IO or unsafe definitions.
def eligible(ready: Bool, version: Bool, covered: Bool, reviewed: Bool, snapshot: Bool) -> Bool:
  ready && (version && (covered && (reviewed && snapshot)))

# Restoration must use an authorized, current, fully resolved mapping set.
def restoreAllowed(authorized: Bool, current: Bool, known: Bool, unambiguous: Bool) -> Bool:
  authorized && (current && (known && unambiguous))

# Independent machine-decision gate. Human eligible remains unchanged.
def automaticEligible(ready: Bool, version: Bool, covered: Bool, decided: Bool, snapshot: Bool, origin: Bool) -> Bool:
  ready && (version && (covered && (decided && (snapshot && origin))))
