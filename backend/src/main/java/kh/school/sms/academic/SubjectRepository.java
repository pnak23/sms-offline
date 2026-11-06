package kh.school.sms.academic;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

public interface SubjectRepository extends JpaRepository<Subject, Long> {
    List<Subject> findAllByOrderBySortOrderAscIdAsc();

    boolean existsByNameKm(String nameKm);

    boolean existsByNameKmAndIdNot(String nameKm, Long id);

    long countByIdIn(Collection<Long> ids);

    @Query("select coalesce(max(s.sortOrder), 0) from Subject s")
    int maxSortOrder();
}
