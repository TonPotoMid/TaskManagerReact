-- ========================================
-- INJECTION : 100 tâches pour hamiddiaw@gmail.com (user_id = 275)
-- Réversible : DELETE FROM task WHERE title LIKE 'Tâche-%' AND user_id = 275;
-- ========================================

-- Crée les matières si elles n'existent pas encore
INSERT INTO subject (name) VALUES
  ('Mathématiques'),
  ('Physique'),
  ('Informatique'),
  ('Anglais'),
  ('Histoire'),
  ('Chimie'),
  ('Philosophie'),
  ('Économie')
ON CONFLICT (name) DO NOTHING;

-- Insertion des 100 tâches
INSERT INTO task (title, description, priority, state, deadline, category, subject_id, user_id)
SELECT
  'Tâche-' || LPAD(i::text, 3, '0') AS title,
  CASE (i % 5)
    WHEN 0 THEN 'Réviser le chapitre ' || i || ' et faire les exercices associés'
    WHEN 1 THEN 'Préparer la présentation n°' || i || ' pour le cours'
    WHEN 2 THEN 'Lire le document ' || i || ' et rédiger un résumé'
    WHEN 3 THEN 'Résoudre les problèmes du TD n°' || i
    ELSE       'Rendre le devoir n°' || i || ' avant la deadline'
  END AS description,
  CASE (i % 4)
    WHEN 0 THEN 'CRITICAL'
    WHEN 1 THEN 'HIGH'
    WHEN 2 THEN 'MEDIUM'
    ELSE        'LOW'
  END AS priority,
  (i % 3 = 0) AS state,
  CASE WHEN (i % 2 = 0)
    THEN (CURRENT_DATE + ((i % 60) + 1) * INTERVAL '1 day')::date
    ELSE NULL
  END AS deadline,
  CASE WHEN (i % 2 = 0) THEN 'WITH_DEADLINE' ELSE 'WITHOUT_DEADLINE' END AS category,
  (
    SELECT id FROM subject
    WHERE name = CASE (i % 8)
      WHEN 0 THEN 'Mathématiques'
      WHEN 1 THEN 'Physique'
      WHEN 2 THEN 'Informatique'
      WHEN 3 THEN 'Anglais'
      WHEN 4 THEN 'Histoire'
      WHEN 5 THEN 'Chimie'
      WHEN 6 THEN 'Philosophie'
      ELSE        'Économie'
    END
  ) AS subject_id,
  275 AS user_id
FROM generate_series(1, 100) AS i;

-- Vérification
SELECT COUNT(*) AS tasks_inserted
FROM task
WHERE user_id = 275
  AND title LIKE 'Tâche-%';
