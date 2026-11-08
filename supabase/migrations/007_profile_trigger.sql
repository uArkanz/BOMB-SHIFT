
-- ============================================================
-- Migration 007: Auto-create profile trigger
-- BOMB//SHIFT — Versao corrigida para Supabase
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate text;
  attempts integer := 0;
BEGIN
  LOOP
    attempts := attempts + 1;

    -- Nickname aleatorio, sem utilizar o email do jogador.
    IF attempts <= 20 THEN
      candidate := 'player_' ||
        left(
          replace(extensions.gen_random_uuid()::text, '-', ''),
          8
        );
    ELSE
      -- Nome mais longo caso haja repeticoes.
      candidate := 'player_' ||
        left(
          replace(extensions.gen_random_uuid()::text, '-', ''),
          12
        );
    END IF;

    -- Tenta inserir o perfil.
    -- Se o nickname ja existir, tenta outro.
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, candidate)
    ON CONFLICT DO NOTHING;

    -- Sucesso: perfil criado.
    IF FOUND THEN
      EXIT;
    END IF;

    -- Evita um loop infinito.
    IF attempts >= 25 THEN
      RAISE EXCEPTION 'Nao foi possivel gerar username unico';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user()
IS 'Cria automaticamente o perfil com nickname aleatorio.';

-- Impedir execucao direta pelos usuarios do aplicativo.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

-- Criar o gatilho quando um usuario se cadastrar.
-- Nao usar DROP TRIGGER aqui.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
