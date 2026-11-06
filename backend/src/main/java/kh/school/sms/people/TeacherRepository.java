package kh.school.sms.people;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TeacherRepository extends JpaRepository<Teacher, Long> {
    /** @param pattern a LIKE pattern from {@code SearchText.contains}, or null; @param status ACTIVE / INACTIVE, or null */
    @Query("select t from Teacher t where (:status is null or t.status = :status) "
            + "and (:pattern is null or t.nameKm like :pattern escape '\\' or t.teacherCode like :pattern escape '\\' "
            + "or t.phone like :pattern escape '\\' or t.specialization like :pattern escape '\\') order by t.id")
    List<Teacher> search(@Param("pattern") String pattern, @Param("status") String status);
}
