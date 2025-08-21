-- Conditional migration to handle workflow_tasks alterations
-- This migration only runs if the tables exist

DO $$ 
BEGIN
    -- Check if workflow_tasks table exists before trying to alter it
    IF EXISTS (SELECT FROM information_schema.tables 
               WHERE table_schema = 'public' 
               AND table_name = 'workflow_tasks') THEN
        
        -- Check if prerequisites column exists and alter it
        IF EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_schema = 'public'
                   AND table_name = 'workflow_tasks' 
                   AND column_name = 'prerequisites') THEN
            -- Only alter if it's not already jsonb
            IF (SELECT data_type FROM information_schema.columns 
                WHERE table_schema = 'public'
                AND table_name = 'workflow_tasks' 
                AND column_name = 'prerequisites') != 'jsonb' THEN
                ALTER TABLE workflow_tasks ALTER COLUMN prerequisites SET DATA TYPE jsonb USING prerequisites::jsonb;
                ALTER TABLE workflow_tasks ALTER COLUMN prerequisites SET DEFAULT '[]'::jsonb;
            END IF;
        END IF;
    END IF;
    
    -- Check if workflow_dependencies table exists and has condition column
    IF EXISTS (SELECT FROM information_schema.tables 
               WHERE table_schema = 'public' 
               AND table_name = 'workflow_dependencies') THEN
        
        IF EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_schema = 'public'
                   AND table_name = 'workflow_dependencies' 
                   AND column_name = 'condition') THEN
            ALTER TABLE workflow_dependencies DROP COLUMN condition;
        END IF;
    END IF;
END $$;