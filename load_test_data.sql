-- ========================================
-- LOAD TEST : Insérer 1000 tâches pour l'utilisateur ID=1
-- PLAN : Sûr et réversible
-- ========================================

-- ÉTAPE 1 : BACKUP des données actuelles
-- (pour pouvoir revenir en arrière si besoin)
CREATE TABLE IF NOT EXISTS task_backup_load_test AS
SELECT * FROM task WHERE user_id = 1;

CREATE TABLE IF NOT EXISTS subject_backup_load_test AS
SELECT * FROM subject;

-- ÉTAPE 2 : Créer des subjects si nécessaire
INSERT INTO subject (name) VALUES 
  ('Work'),
  ('Personal'),
  ('Shopping'),
  ('Health'),
  ('Learning')
ON CONFLICT DO NOTHING;

-- ÉTAPE 3 : Vérifier les subject IDs disponibles
-- (SELECT id FROM subject LIMIT 5;)

-- ÉTAPE 4 : Insérer les tâches de test progressivement
-- PHASE A : 10 tâches de test (pour vérifier la structure)
INSERT INTO task (title, description, priority, state, deadline, subject_id, user_id)
SELECT 
  'Test Task ' || i::text,
  'This is test task number ' || i::text || ' for load testing',
  CASE (i % 3)
    WHEN 0 THEN 'HIGH'
    WHEN 1 THEN 'MEDIUM'
    ELSE 'LOW'
  END as priority,
  (i % 3 = 0) as state, -- ~33% marked as completed
  CASE WHEN (i % 2 = 0) THEN (NOW()::date + (random() * 60)::int) ELSE NULL END as deadline,
  ((i % 5) + 1) as subject_id,
  1 as user_id
FROM generate_series(1, 10) as i;

-- Vérifier : devrait afficher 10 nouvelles tâches
-- SELECT COUNT(*) FROM task WHERE title LIKE 'Test Task%' AND user_id = 1;

-- ========================================
-- PHASE B : 990 tâches supplémentaires (total 1000)
-- DÉCOMMENTER APRÈS AVOIR VALIDÉ QUE LES 10 PREMIÈRES MARCHENT
-- ========================================
/*
INSERT INTO task (title, description, priority, state, deadline, subject_id, user_id)
SELECT 
  'Test Task ' || (i+10)::text,
  'This is test task number ' || (i+10)::text || ' for load testing',
  CASE ((i+10) % 3)
    WHEN 0 THEN 'HIGH'
    WHEN 1 THEN 'MEDIUM'
    ELSE 'LOW'
  END as priority,
  ((i+10) % 3 = 0) as state,
  CASE WHEN ((i+10) % 2 = 0) THEN (NOW()::date + (random() * 60)::int) ELSE NULL END as deadline,
  (((i+10) % 5) + 1) as subject_id,
  1 as user_id
FROM generate_series(1, 990) as i;

-- Vérifier : devrait afficher 1000 tâches au total
-- SELECT COUNT(*) FROM task WHERE title LIKE 'Test Task%' AND user_id = 1;
*/

-- ========================================
-- ROLLBACK : Si besoin de réversibilité complète
-- ========================================
/*
-- Supprimer les 1000 tâches de test :
DELETE FROM task WHERE user_id = 1 AND title LIKE 'Test Task%';

-- Restaurer depuis le backup si quelque chose d'autre fut affecté :
-- DROP TABLE task_backup_load_test;
-- DROP TABLE subject_backup_load_test;
*/
