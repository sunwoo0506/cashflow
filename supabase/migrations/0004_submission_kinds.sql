-- 0004 · 제출 종류에 영업 파이프라인 추가
--
-- 0001 의 submission_kind 는 ('수금계획','고정비','일회성지출') 세 가지였다.
-- 영업부가 올리는 영업관리 파일에는 수주 전 건(파이프라인)도 들어 있어 종류를 하나 늘린다.

alter type submission_kind add value if not exists '영업파이프라인';
